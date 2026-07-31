import { adressiert } from "@/lib/analysis/listingAudit";
import type { FeatureQuellen } from "@/lib/analysis/featureRanking";

/**
 * Abdeckungs-Rechnung (D265): Wird ein Nutzen-Baustein im Listing überhaupt
 * behauptet — und wo? Rein deterministisch, ohne LLM: der Code sieht die
 * Quelltexte und rechnet, das Modell darf hier nichts „einschätzen" (D184).
 *
 * Drei Stufen statt zwei (Nutzer-Befund 30.07. am Beispiel „entspannter
 * Beinfreiheit"): Der Nutzen stand faktisch im Listing — als Nebensatz mitten
 * in Bullet 2, hinter Stahl-Anteil und Gewicht. Vorhanden und praktisch
 * unsichtbar ist nicht dasselbe wie prominent, deshalb zählt die Position mit.
 *
 * „nicht_erfasst" ist NICHT „fehlt" (D145-Prinzip): Was der Import-Weg nie
 * gesehen hat, darf nicht als Lücke behauptet werden — dort kann eine Antwort
 * stehen, die der Lauf nicht kennt. Solche Kanäle erzeugen keinen Blocker,
 * sondern eine Zeile in den Grenzen der Analyse.
 */

/** Text-Kanäle in absteigender Sichtbarkeit. */
export const TEXT_KANAELE = ["title", "bullets", "description", "attributes", "important_info", "aplus"] as const;
export type TextKanal = (typeof TEXT_KANAELE)[number];

export const KANAL_LABEL: Record<TextKanal | "bilder", string> = {
  title: "Titel",
  bullets: "Bullets",
  description: "Beschreibung",
  attributes: "Attribute",
  important_info: "Wichtige Informationen",
  aplus: "A+-Inhalt",
  bilder: "Bilder",
};

/**
 * Prominent gelten nur Titel und Bullets — und bei Bullets nur Bullet 1 oder
 * der Anfang eines Bullets (siehe `textAbdeckung`). Beschreibung, Attribute,
 * Wichtige Informationen und A+ sind immer „erwähnt": dort sucht niemand ein
 * Kaufargument.
 *
 * Ab diesem Zeichen-Offset im Bullet gilt eine Erwähnung als Nebensatz.
 */
const PROMINENZ_FENSTER = 80;

export type AbdeckungsStufe = "prominent" | "erwaehnt" | "fehlt" | "nicht_erfasst";

export type KanalTreffer = {
  kanal: TextKanal;
  stufe: AbdeckungsStufe;
  /** Die getroffenen Themenwörter — Beleg, damit die Stufe nachprüfbar ist. */
  treffer: string[];
  /** Bei Bullets: 1-basierte Nummer des Bullets mit dem Treffer. */
  position?: number;
};

/**
 * Abdeckung eines Nutzens über alle Text-Kanäle.
 * Nutzt denselben `adressiert()`-Abgleich wie die Listing-Kontrolle — ein
 * zweiter, abweichender Matcher wäre eine zweite Wahrheit (D183).
 */
export function textAbdeckung(
  quellen: FeatureQuellen,
  nutzen: string,
): { kanaele: KanalTreffer[]; stufe: AbdeckungsStufe } {
  const kanaele: KanalTreffer[] = [];

  const einfach = (kanal: TextKanal, text: string, prominentWennTreffer: boolean) => {
    if (!text.trim()) {
      kanaele.push({ kanal, stufe: "nicht_erfasst", treffer: [] });
      return;
    }
    const { ok, treffer } = adressiert(text, nutzen);
    kanaele.push({ kanal, stufe: ok ? (prominentWennTreffer ? "prominent" : "erwaehnt") : "fehlt", treffer });
  };

  einfach("title", quellen.title ?? "", true);

  // Bullets einzeln: Bullet 1 und der Anfang jedes Bullets sind prominent,
  // ein Treffer im hinteren Teil eines späteren Bullets ist nur „erwähnt".
  if (quellen.bullets.length === 0 || quellen.bullets.every((b) => !b.trim())) {
    kanaele.push({ kanal: "bullets", stufe: "nicht_erfasst", treffer: [] });
  } else {
    let beste: KanalTreffer = { kanal: "bullets", stufe: "fehlt", treffer: [] };
    for (const [i, bullet] of quellen.bullets.entries()) {
      const { ok, treffer } = adressiert(bullet, nutzen);
      if (!ok) continue;
      const prominent = i === 0 || adressiert(bullet.slice(0, PROMINENZ_FENSTER), nutzen).ok;
      const kandidat: KanalTreffer = {
        kanal: "bullets",
        stufe: prominent ? "prominent" : "erwaehnt",
        treffer,
        position: i + 1,
      };
      // Bester Fund gewinnt; bei gleicher Stufe bleibt der frühere Bullet stehen.
      if (prominent || beste.stufe === "fehlt") beste = kandidat;
      if (prominent) break;
    }
    kanaele.push(beste);
  }

  einfach("description", quellen.description ?? "", false);
  einfach(
    "attributes",
    quellen.attributes ? Object.entries(quellen.attributes).map(([k, v]) => `${k}: ${v}`).join("\n") : "",
    false,
  );
  einfach("important_info", quellen.importantInfo ?? "", false);
  einfach("aplus", quellen.aplusContent ?? "", false);

  const hat = (s: AbdeckungsStufe) => kanaele.some((k) => k.stufe === s);
  const stufe: AbdeckungsStufe = hat("prominent")
    ? "prominent"
    : hat("erwaehnt")
      ? "erwaehnt"
      : hat("fehlt")
        ? "fehlt"
        : "nicht_erfasst";

  return { kanaele, stufe };
}

/** Ein Bild als Beleg-Quelle: ausgelesener Inhalt + Botschafts-Note des Bild-Audits. */
export type BildBeleg = {
  slot: number;
  /** Bild-Auslese als Text (Inhalt + Text im Bild + Claims). */
  text: string;
  /** Note 0–5 der Dimension „Botschaft"; null = Bild-Audit lief nicht. */
  botschaft: number | null;
};

export type BildStufe = "belegt" | "schwach" | "nicht_bewertet" | "fehlt" | "nicht_erfasst";

/** Ab dieser Note gilt ein Bild als überzeugender Beweis (Skala 0–5 des Bild-Audits). */
export const BOTSCHAFT_SCHWELLE = 3;

/**
 * Bildbeweis für einen Nutzen. Das ist die Stelle, an der aus „Text behauptet
 * es" ein Blocker wird — bei allen vier Blockern des Referenz-Musters lag die
 * Lücke im Bildset, nicht im Text.
 */
export function bildAbdeckung(
  bilder: BildBeleg[],
  nutzen: string,
): { stufe: BildStufe; slot?: number; note?: number | null } {
  const vorhanden = bilder.filter((b) => b.text.trim());
  if (vorhanden.length === 0) return { stufe: "nicht_erfasst" };

  const treffer = vorhanden.filter((b) => adressiert(b.text, nutzen).ok);
  if (treffer.length === 0) return { stufe: "fehlt" };

  const bewertet = treffer.filter((b) => b.botschaft !== null);
  if (bewertet.length === 0) return { stufe: "nicht_bewertet", slot: treffer[0].slot, note: null };

  // Selbst der BESTE Treffer entscheidet — ist der zu schwach, ist der Beweis schwach.
  const best = bewertet.reduce((a, b) => ((b.botschaft ?? 0) > (a.botschaft ?? 0) ? b : a));
  return {
    stufe: (best.botschaft ?? 0) < BOTSCHAFT_SCHWELLE ? "schwach" : "belegt",
    slot: best.slot,
    note: best.botschaft,
  };
}

/** Bild-Belege aus einem Listing-Snapshot (`bilderText`) — eine Quelle, kein zweites Format. */
export function bildBelegeAusSnapshot(
  bilderText:
    | Array<{
        slot: number;
        textImBild: string[];
        inhalt: string;
        claims: string[];
        faktoren?: Record<string, { score: number | null }> | null;
      }>
    | null
    | undefined,
): BildBeleg[] {
  return (bilderText ?? []).map((b) => ({
    slot: b.slot,
    text: [b.inhalt, ...b.textImBild, ...b.claims].filter(Boolean).join(" · "),
    botschaft: b.faktoren?.message?.score ?? null,
  }));
}
