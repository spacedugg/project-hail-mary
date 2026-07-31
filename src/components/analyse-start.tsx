"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runPipelineStufe, type PipelineErgebnis } from "@/app/actions";
import { AsinChips } from "@/components/asin-chips";

/** A+-Bild im Client: base64 fürs Auslesen + Vorschau/Name für die UI (D220). */
type AplusBildClient = { mediaType: string; data: string; previewUrl: string; name: string };
const MAX_APLUS = 9;

/**
 * Skaliert ein Bild client-seitig herunter (längste Kante ≤ 1400 px, JPEG q0.82)
 * und gibt base64 zurück. Hält den Server-Action-Request klein (D220) und reicht
 * für die Text-Auslese locker. Gibt null zurück, wenn die Datei kein Bild ist.
 */
async function dateiZuAplus(file: File): Promise<AplusBildClient | null> {
  if (!file.type.startsWith("image/")) return null;
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Bild konnte nicht gelesen werden"));
    i.src = dataUrl;
  });
  const max = 1400;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.82);
  const komma = out.indexOf(",");
  return { mediaType: "image/jpeg", data: out.slice(komma + 1), previewUrl: out, name: file.name };
}

/**
 * Start-Maske + Ein-Klick-Pipeline (D172, Nutzer-Vorgabe 22.07.): EINE Maske
 * fragt alles zugleich ab (Wettbewerber-ASINs, Content-Auswahl), EIN Klick
 * fährt alle Etappen automatisch NACHEINANDER — je Etappe ein Request
 * (D136-Etappen-Prinzip), Fortschritt sichtbar, fehlgeschlagene Etappen
 * einzeln erneut anstoßbar.
 */

const SEKTIONEN = [
  { key: "title", label: "Titel" },
  { key: "bullets", label: "Bullet Points" },
  { key: "highlights", label: "Item Highlights" },
  { key: "backend", label: "Backend-Keywords" },
  { key: "description", label: "Beschreibung" },
  { key: "qa", label: "Q&A" },
] as const;

type Etappe = {
  stufe: "listing" | "scrape" | "auswertung" | "wettbewerb-texte" | "verdichtung" | "blocker" | "features" | "driver" | "audit" | "content";
  section?: string;
  label: string;
  status: "offen" | "laeuft" | "fertig" | "fehler";
  detail?: string;
  /** Content ohne Analyse nur mit ausdrücklicher Bestätigung (GEN-02). */
  bestaetigt?: boolean;
  /** Harte Abhängigkeit: scheitert sie, stoppt der Lauf (spätere Etappen brauchen sie). */
  hart: boolean;
};

export function AnalyseStart({
  productId,
  mainAsin,
  nurAnalyse = false,
  vergleichsAsins = [],
}: {
  productId: string;
  mainAsin: string | null;
  /** true (Analyse-Reiter): Lauf ohne Content-Generierung — „Neu scrapen & analysieren". */
  nurAnalyse?: boolean;
  /**
   * Vergleichsprodukte aus dem Keyword-Export (D268) — Vorbelegung, kein Zwang.
   * Der Scrape ergänzt sie ohnehin serverseitig; hier sind sie sichtbar und
   * abwählbar, damit die Automatik nachvollziehbar bleibt.
   */
  vergleichsAsins?: string[];
}) {
  const router = useRouter();
  const [etappen, setEtappen] = useState<Etappe[]>([]);
  const [asins, setAsins] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [aplus, setAplus] = useState<AplusBildClient[]>([]);
  const [ziehtDrueber, setZiehtDrueber] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);

  const nimmDateien = async (dateien: FileList | null) => {
    if (!dateien?.length) return;
    const neu = (await Promise.all([...dateien].map((f) => dateiZuAplus(f).catch(() => null)))).filter(
      (b): b is AplusBildClient => b !== null,
    );
    setAplus((prev) => [...prev, ...neu].slice(0, MAX_APLUS));
  };

  const setzeStatus = (i: number, status: Etappe["status"], detail?: string) =>
    setEtappen((prev) => prev.map((e, n) => (n === i ? { ...e, status, detail } : e)));

  const fahre = async (plan: Etappe[], ab: number, asinListe: string[]) => {
    setLaeuft(true);
    let fehlerFrei = true;
    for (let i = ab; i < plan.length; i++) {
      const e = plan[i];
      if (e.status === "fertig") continue;
      setzeStatus(i, "laeuft");
      let res: PipelineErgebnis;
      try {
        res = await runPipelineStufe(
          productId,
          e.stufe,
          e.stufe === "scrape"
            ? { asins: asinListe, force: nurAnalyse }
            : e.stufe === "listing"
              ? { aplusBilder: aplus.map((b) => ({ mediaType: b.mediaType, data: b.data })) }
              : e.section
                ? { section: e.section, ohneAnalyseBestaetigt: e.bestaetigt === true }
                : undefined,
        );
      } catch (err) {
        res = { ok: false, fehler: err instanceof Error ? err.message : String(err), code: "ALG-00" };
      }
      if (!res.ok) {
        fehlerFrei = false;
        setzeStatus(i, "fehler", `${res.fehler}${res.code ? ` (${res.code})` : ""}`);
        if (e.hart) {
          setLaeuft(false);
          return;
        }
        continue;
      }
      setzeStatus(i, "fertig", res.hinweis);
      // KEIN router.refresh() je Etappe: sobald die Analyse existiert, würde
      // die Server-Seite diese Start-Maske abbauen und der Fortschritt
      // verschwände mitten im Lauf.
    }
    setLaeuft(false);
    setFertig(true);
    // Fehlerfrei → direkt zu den Ergebnis-Reitern; mit Fehlern bleibt die
    // Übersicht stehen (Knopf „Ergebnisse anzeigen").
    if (fehlerFrei) router.refresh();
  };

  const starte = async (fd: FormData) => {
    const liste = [...new Set(String(fd.get("asins") ?? "").split(/[\s,;]+/).map((a) => a.trim().toUpperCase()).filter(Boolean))];
    const sections = fd.getAll("sections").map(String);
    // Bewusste Bestätigung (GEN-02/Review-Fix): Produkte ohne Reviews kommen
    // nur so zu Content — die Review-Etappen werden dann weiche Etappen.
    const ohneAnalyse = fd.get("ohneAnalyse") === "on";
    const plan: Etappe[] = [
      { stufe: "listing", label: "Amazon Listing laden (Texte, Bilder, Bildanalyse)", status: "offen", hart: true },
      { stufe: "scrape", label: `Reviews scrapen (${liste.length} ASIN${liste.length === 1 ? "" : "s"})`, status: "offen", hart: !ohneAnalyse },
      { stufe: "auswertung", label: "Reviews auswerten (Pain Points, Kaufauslöser)", status: "offen", hart: !ohneAnalyse },
      { stufe: "wettbewerb-texte", label: "Wettbewerber-Listings abgleichen (fehlende Infos)", status: "offen", hart: false },
      { stufe: "verdichtung", label: "Erkenntnisse verdichten", status: "offen", hart: false },
      // Die Alt-Etappe „blocker" (D167) läuft NICHT mehr mit (D266): Der
      // Driver-Lauf leitet die Blocker aus den Kaufgründen ab. Zwei Läufe für
      // dieselbe Liste wären fünf LLM-Aufrufe für Daten, die keine Ansicht mehr
      // zeigt. Bestehende Blocker-Zeilen bleiben lesbar, solange ein Produkt
      // noch keinen Driver-Lauf hat; die Etappe ist über runPipelineStufe
      // weiterhin einzeln aufrufbar.
      { stufe: "features", label: "Produkt-Features ranken", status: "offen", hart: false },
      // D265: nach den Features, weil deren Liste den Ballast-Abgleich trägt
      // (Merkmal im Listing, das keinem Kaufgrund zuarbeitet).
      { stufe: "driver", label: "Conversion Driver ermitteln (Kaufgründe + Beweislücken)", status: "offen", hart: false },
      { stufe: "audit", label: "KI-Bewertung des Listings", status: "offen", hart: false },
      ...sections.map((s) => ({
        stufe: "content" as const,
        section: s,
        label: `${SEKTIONEN.find((x) => x.key === s)?.label ?? s} texten`,
        status: "offen" as const,
        hart: false,
        bestaetigt: ohneAnalyse,
      })),
    ];
    setEtappen(plan);
    setAsins(liste);
    await fahre(plan, 0, liste);
  };

  const fehlerIndex = etappen.findIndex((e) => e.status === "fehler");

  if (etappen.length > 0) {
    return (
      <div className="mt-4 rounded-xl border border-hair p-4">
        <h3 className="text-sm font-semibold">{fertig ? "Fertig" : laeuft ? "Analyse läuft" : "Analyse unterbrochen"}</h3>
        <ul className="mt-3 space-y-1.5">
          {etappen.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-5 flex-none text-center">
                {e.status === "fertig" ? <span className="text-good">✓</span>
                  : e.status === "laeuft" ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                  : e.status === "fehler" ? <span className="text-bad">✕</span>
                  : <span className="text-muted">·</span>}
              </span>
              <span className={e.status === "offen" ? "text-muted" : ""}>
                {e.label}
                {e.status === "fertig" && e.detail && <span className="block text-[11px] text-muted">{e.detail}</span>}
                {e.status === "fehler" && <span className="block text-[11px] text-bad">{e.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        {!laeuft && fehlerIndex >= 0 && (
          <button type="button" onClick={() => fahre(etappen, fehlerIndex, asins)} className="btn-primary mt-3 text-xs">
            Ab der fehlgeschlagenen Etappe fortsetzen
          </button>
        )}
        {fertig && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => router.refresh()} className="btn-primary text-xs">Ergebnisse anzeigen</button>
            <p className="text-sm text-muted">Content und Analyse stehen danach in den Reitern oben.</p>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Der Lauf braucht mehrere Minuten. Seite offen lassen.</p>
      </div>
    );
  }

  return (
    // BEWUSST onSubmit statt <form action>: Eine Form-Action läuft als EINE
    // React-Transition — deren Zwischen-Status (Etappen-Fortschritt) würde
    // erst NACH dem kompletten Lauf gerendert. Der Klick wirkte dann tot,
    // obwohl die Pipeline lief (Nutzer-Befund 22.07.).
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void starte(new FormData(e.currentTarget));
      }}
      className="mt-4 space-y-4"
    >
      {/* Optionaler A+ (D220): A+-Bilder hochladen → werden EINMAL ausgelesen
          (Text + Inhalt fließt in Analyse & Texterstellung) und danach NICHT
          gespeichert. Client skaliert herunter; nur base64 reist zum Server. */}
      <div>
        <h3 className="text-sm font-semibold">Optionaler A+</h3>
        <p className="mt-0.5 text-xs text-muted">
          Zieh hier die A+-/„Vom Hersteller“-Bilder rein (nicht scrapebar). Sie werden <b>einmal ausgelesen</b> —
          Text und Inhalt fließen wie eine Beschreibung in Analyse &amp; Texterstellung — und danach <b>nicht gespeichert</b>.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setZiehtDrueber(true); }}
          onDragLeave={() => setZiehtDrueber(false)}
          onDrop={(e) => { e.preventDefault(); setZiehtDrueber(false); void nimmDateien(e.dataTransfer.files); }}
          onClick={() => dateiRef.current?.click()}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center text-xs transition-colors ${ziehtDrueber ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-hair text-muted hover:border-[var(--primary)]"}`}
        >
          <input
            ref={dateiRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { void nimmDateien(e.target.files); if (e.target) e.target.value = ""; }}
          />
          {aplus.length === 0
            ? "A+-Bilder hierher ziehen oder klicken zum Auswählen"
            : `${aplus.length}/${MAX_APLUS} Bild${aplus.length === 1 ? "" : "er"} — klicken für mehr`}
        </div>
        {aplus.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {aplus.map((b, i) => (
              <div key={i} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.previewUrl} alt={b.name} className="h-16 w-16 rounded-lg border border-hair object-cover" />
                <button
                  type="button"
                  onClick={() => setAplus((prev) => prev.filter((_, n) => n !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] text-white shadow"
                  aria-label={`${b.name} entfernen`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Vergleichs-ASINs</h3>
        <p className="mt-0.5 text-xs text-muted">
          {vergleichsAsins.length > 0 ? (
            <>
              Aus deinem Keyword-Export übernommen — es sind dieselben Produkte, gegen die die Keyword-Recherche
              gelaufen ist. Du musst hier nichts eintragen; abwählen oder ergänzen kannst du trotzdem.
            </>
          ) : (
            <>
              Deine Produkt-ASIN ist vorbelegt. Lade einen Keyword-Export mit Wettbewerber-Spalten hoch, dann stehen
              die Vergleichsprodukte automatisch hier. Sonst hier eintragen.
            </>
          )}{" "}
          Sie fließen in die Bewertungs-Analyse <b>und</b> in den Wettbewerber-Listing-Abgleich („fehlende Infos“).
        </p>
        <div className="mt-2">
          <AsinChips name="asins" mainAsin={mainAsin} placeholder="Wettbewerber-ASIN eingeben …" vorbelegt={vergleichsAsins} />
        </div>
      </div>
      {!nurAnalyse && (
        <div>
          <h3 className="text-sm font-semibold">Content</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {SEKTIONEN.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="checkbox" name="sections" value={key} defaultChecked />
                {label}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="ohneAnalyse" />
            Auch ohne Bewertungs-Analyse texten (Produkt ohne Reviews)
          </label>
        </div>
      )}
      <button type="submit" disabled={!mainAsin} className="btn-primary disabled:opacity-40">
        {nurAnalyse ? "Neu scrapen & analysieren" : "Analysieren & Texte erstellen"}
      </button>
      {!mainAsin && <p className="text-xs text-warn">△ Dafür braucht das Produkt eine ASIN.</p>}
    </form>
  );
}
