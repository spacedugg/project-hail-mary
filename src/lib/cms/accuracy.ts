import { slotDef, type ContentSlot } from "@/lib/amazon/attributes";

/**
 * Soll/Ist-Abgleich — das Herz der Content-Verwaltung.
 *
 * Soll = unser freigegebener Stand in der Datenbank.
 * Ist  = der zuletzt gecrawlte Live-Zustand des Listings.
 *
 * Ehrliche Grenzen, bewusst im Ergebnis sichtbar statt weggerechnet:
 * - Backend-Keywords sind auf der Produktseite unsichtbar → NIE abgleichbar.
 * - Bilder liefert Amazon über eigene CDN-Adressen → ein URL-Vergleich sagt
 *   nichts aus. Prüfbar ist nur: „Hauptbild vorhanden ja/nein".
 * - Ohne Ist-Daten gibt es KEINE Accuracy — dann steht dort `null`, nicht 0 %
 *   und erst recht nicht 100 %.
 */

export type AbgleichStatus = "live" | "abweichung" | "fehlt_live" | "kein_soll" | "nicht_pruefbar";

export type SlotAbgleich = {
  slot: ContentSlot;
  label: string;
  status: AbgleichStatus;
  soll: string | null;
  ist: string | null;
  /** 0–1, nur bei Text-Slots mit Soll UND Ist. */
  aehnlichkeit: number | null;
  hinweis?: string;
};

export type SollStand = {
  title?: string | null;
  bullets?: string[] | null;
  description?: string | null;
  backendKeywords?: string | null;
  mainImageUrl?: string | null;
};

export type IstStand = {
  title?: string | null;
  bullets?: string[] | null;
  description?: string | null;
  imageUrls?: string[] | null;
  /** Zeitpunkt des Crawls — ohne ihn ist der Ist-Stand wertlos. */
  gecrawltAm?: Date | null;
};

export type AbgleichErgebnis = {
  slots: SlotAbgleich[];
  /** Anteil der prüfbaren Slots, die live dem Soll entsprechen. null = nicht messbar. */
  accuracyPct: number | null;
  pruefbar: number;
  live: number;
  gecrawltAm: Date | null;
};

/** Vergleichs-Normalisierung: Tippografie und Leerraum sind keine Abweichung. */
export function normalisiere(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[„“”«»]/g, '"')
    .replace(/[‚‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Dice-Koeffizient über Zeichen-Bigramme — deterministisch, ohne Abhängigkeit. */
export function aehnlichkeit(a: string, b: string): number {
  const x = normalisiere(a);
  const y = normalisiere(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(x);
  const mb = bigrams(y);
  let treffer = 0;
  for (const [g, n] of ma) treffer += Math.min(n, mb.get(g) ?? 0);
  return (2 * treffer) / (x.length - 1 + y.length - 1);
}

const GLEICH_SCHWELLE = 0.999;

function textAbgleich(slot: ContentSlot, soll: string | null | undefined, ist: string | null | undefined): SlotAbgleich {
  const label = slotDef(slot)?.label ?? slot;
  const s = soll?.trim() || null;
  const i = ist?.trim() || null;
  if (!s) return { slot, label, status: "kein_soll", soll: null, ist: i, aehnlichkeit: null };
  if (!i) return { slot, label, status: "fehlt_live", soll: s, ist: null, aehnlichkeit: 0 };
  const a = aehnlichkeit(s, i);
  return { slot, label, status: a >= GLEICH_SCHWELLE ? "live" : "abweichung", soll: s, ist: i, aehnlichkeit: a };
}

export function vergleiche(soll: SollStand, ist: IstStand | null): AbgleichErgebnis {
  const slots: SlotAbgleich[] = [];

  /**
   * Zwei Fälle, die NICHT verwechselt werden dürfen:
   * - `ist === null`: Es wurde nie gecrawlt. Dann wissen wir nichts — kein Slot
   *   darf „fehlt live" heißen, keine Accuracy, kein Alert.
   * - Snapshot vorhanden, aber leer: Der Crawl hat nichts gefunden. DAS ist ein
   *   Befund (Listing gesperrt/unterdrückt) und wird als solcher gemeldet.
   */
  if (!ist) {
    const ohneIst = (slot: ContentSlot, sollWert: string | null | undefined): SlotAbgleich => ({
      slot,
      label: slotDef(slot)?.label ?? slot,
      status: "nicht_pruefbar",
      soll: sollWert?.trim() || null,
      ist: null,
      aehnlichkeit: null,
      hinweis: "Kein gecrawlter Ist-Stand — Live-Listing einlesen.",
    });
    return {
      slots: [
        ohneIst("title", soll.title),
        ohneIst("bullets", (soll.bullets ?? []).filter(Boolean).join("\n") || null),
        ohneIst("description", soll.description),
        ohneIst("backend_keywords", soll.backendKeywords),
        ohneIst("main_image", soll.mainImageUrl),
      ],
      accuracyPct: null,
      pruefbar: 0,
      live: 0,
      gecrawltAm: null,
    };
  }

  const keinIst = !ist.title && !ist.bullets?.length && !ist.description;

  slots.push(textAbgleich("title", soll.title, ist?.title));
  slots.push(
    textAbgleich(
      "bullets",
      (soll.bullets ?? []).filter(Boolean).join("\n") || null,
      (ist?.bullets ?? []).filter(Boolean).join("\n") || null,
    ),
  );
  slots.push(textAbgleich("description", soll.description, ist?.description));

  // Backend-Keywords: nie am Live-Listing sichtbar.
  slots.push({
    slot: "backend_keywords",
    label: slotDef("backend_keywords")?.label ?? "Backend-Keywords",
    status: "nicht_pruefbar",
    soll: soll.backendKeywords?.trim() || null,
    ist: null,
    aehnlichkeit: null,
    hinweis: "Auf der Produktseite unsichtbar — nur über Seller Central bzw. die API prüfbar.",
  });

  // Hauptbild: prüfbar ist nur die Existenz, nicht die Identität.
  const bildIst = (ist?.imageUrls ?? []).filter(Boolean);
  slots.push({
    slot: "main_image",
    label: slotDef("main_image")?.label ?? "Hauptbild",
    status: !soll.mainImageUrl
      ? "kein_soll"
      : bildIst.length === 0
        ? "fehlt_live"
        : "nicht_pruefbar",
    soll: soll.mainImageUrl ?? null,
    ist: bildIst[0] ?? null,
    aehnlichkeit: null,
    hinweis:
      bildIst.length === 0
        ? "Kein Bild am Live-Listing gefunden — Hauptbild-Alarm."
        : "Amazon liefert eigene CDN-Adressen; ein echter Bildvergleich braucht Bild-Hashing (geplant).",
  });

  if (keinIst) {
    return { slots, accuracyPct: null, pruefbar: 0, live: 0, gecrawltAm: ist?.gecrawltAm ?? null };
  }

  const pruefbare = slots.filter((s) => s.status === "live" || s.status === "abweichung" || s.status === "fehlt_live");
  const live = pruefbare.filter((s) => s.status === "live").length;
  return {
    slots,
    accuracyPct: pruefbare.length ? Math.round((live / pruefbare.length) * 100) : null,
    pruefbar: pruefbare.length,
    live,
    gecrawltAm: ist?.gecrawltAm ?? null,
  };
}

export type AlertArt = "text_ueberschrieben" | "hauptbild_weg" | "listing_leer" | "nie_live";

export type AbgeleiteterAlert = {
  art: AlertArt;
  slot: ContentSlot | null;
  schwere: "hoch" | "mittel";
  nachricht: string;
};

/**
 * Content-Alerts entstehen NICHT separat, sondern fallen aus dem Abgleich —
 * eine Quelle der Wahrheit für „was stimmt nicht".
 */
export function alertsAus(e: AbgleichErgebnis, produktName: string): AbgeleiteterAlert[] {
  // Ohne gecrawlten Ist-Stand gibt es NICHTS zu melden. Ein Alert wie
  // „Titel nicht live" wäre schlicht erfunden — wir haben nie nachgesehen.
  if (e.gecrawltAm === null && e.pruefbar === 0) return [];

  const alerts: AbgeleiteterAlert[] = [];
  const text = e.slots.filter((s) => ["title", "bullets", "description"].includes(s.slot));

  // Der Crawl lief, fand aber keinen einzigen Text → EIN klarer Befund statt
  // drei Einzelmeldungen.
  if (text.length > 0 && text.every((s) => s.status === "fehlt_live"))
    return [
      {
        art: "listing_leer",
        slot: null,
        schwere: "hoch",
        nachricht: `${produktName}: Am Live-Listing ist kein Text auffindbar — Listing gesperrt, unterdrückt oder nicht erreichbar?`,
      },
    ];

  for (const s of text) {
    if (s.status === "abweichung")
      alerts.push({
        art: "text_ueberschrieben",
        slot: s.slot,
        schwere: "mittel",
        nachricht: `${produktName}: ${s.label} weicht vom freigegebenen Stand ab (${Math.round((s.aehnlichkeit ?? 0) * 100)} % Übereinstimmung).`,
      });
    if (s.status === "fehlt_live")
      alerts.push({
        art: "nie_live",
        slot: s.slot,
        schwere: "mittel",
        nachricht: `${produktName}: ${s.label} ist freigegeben, aber am Live-Listing nicht vorhanden.`,
      });
  }

  const bild = e.slots.find((s) => s.slot === "main_image");
  if (bild?.status === "fehlt_live")
    alerts.push({ art: "hauptbild_weg", slot: "main_image", schwere: "hoch", nachricht: `${produktName}: Kein Hauptbild am Live-Listing.` });

  return alerts;
}
