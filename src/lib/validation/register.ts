import type { ValidationIssue } from "@/db/schema";

/**
 * Regel-Register (D181): DIE eine Quelle für qualitative Regeln.
 * Jede Regel fließt von hier aus in (a) den Generierungs-Prompt, (b) den
 * LLM-Prüfer (D182) und — wo deterministisch prüfbar — (c) das Gate.
 * Eine Regel, die hier nicht steht, existiert für das Tool nicht;
 * knowledge/content/*.md liefert Herkunft & Begründung, dieses Register
 * die maschinenwirksame Form.
 *
 * `art`:
 *  - "deterministisch": das Gate prüft sie in Code (gate.ts referenziert die id).
 *  - "llm": der LLM-Prüfer beurteilt sie mit Prüfprotokoll (bestanden/verletzt + Beleg).
 * Beide Arten stehen im Prompt — der Prüfer bekommt nur die llm-Regeln,
 * Doppelprüfung deterministischer Regeln wäre verschenkte Tokens.
 */

export type RegelSektion = "title" | "bullets" | "highlights" | "backend" | "description" | "qa";

export type Regel = {
  id: string;
  sektionen: RegelSektion[] | "alle";
  art: "deterministisch" | "llm";
  severity: ValidationIssue["severity"];
  /** Die Regel als Klartext — wortgleich im Prompt UND im Prüfprotokoll. */
  text: string;
};

export const REGELN: Regel[] = [
  // ── Sprach- und Integrationsregeln (Kern des Ulmenrinde-Befunds, D180) ─────
  {
    id: "sprache.grammatik",
    // bewusst OHNE backend: das Feld ist eine Wortliste, keine Sätze
    sektionen: ["title", "bullets", "highlights", "description", "qa"],
    art: "llm",
    severity: "error",
    text:
      "Fehlerfreies Deutsch: vollständige, grammatisch korrekte Sätze; Substantive groß; keine sinnfreien Wortfolgen. Ein Text, der wie eine aneinandergereihte Suchbegriff-Liste klingt, ist falsch.",
  },
  {
    id: "sprache.keyword-natuerlich",
    sektionen: ["title", "bullets", "highlights", "description"],
    art: "llm",
    severity: "error",
    text:
      "Keywords werden GRAMMATISCH integriert: flektiert, mit angepasster Groß-/Kleinschreibung und nötigen Bindestrichen — NIE als rohe Suchphrase wörtlich eingeklebt (falsch: „gegen Sodbrennen Hund“, „die grasfresser drops hund riechen“; richtig: „Drops gegen Sodbrennen beim Hund“). Amazon matcht Wortstämme — die exakte Suchphrase einzukleben bringt kein Ranking und zerstört die Lesbarkeit.",
  },
  {
    id: "sprache.keyword-synonyme",
    sektionen: ["title", "bullets", "highlights", "description"],
    art: "llm",
    severity: "error",
    text:
      "Keyword-Synonyme, die dasselbe bezeichnen (z. B. „Slippery Elm“ = „Ulmenrinde“), NIE als getrennte Zutaten, Features oder Fakten behandeln — ein Ding, ein Fakt, notfalls eine Nennung mit Klammer-Synonym.",
  },
  {
    id: "sprache.wirkversprechen",
    sektionen: ["title", "bullets", "highlights", "description", "qa"],
    art: "llm",
    severity: "error",
    text:
      "Keine UNBELEGTEN Gesundheits- oder Wirkversprechen. BELEGT heißt: Die Aussage steht sinngemäß im Original-Listing, der Produkt-Wahrheit oder den Zusatz-Infos (steht dort „gegen Sodbrennen“, ist „gegen Sodbrennen“ zulässig — Nutzer-Klarstellung 23.07./D194). Verboten sind NEU ERFUNDENE Heil-/Wirkzusagen ohne Quelle („heilt“, „stärkt das Immunsystem“, „klinisch bewiesen“).",
  },
  // ── Titel ──────────────────────────────────────────────────────────────────
  {
    id: "title.lesbarkeit",
    sektionen: ["title"],
    art: "llm",
    severity: "error",
    text:
      "Der Titel liest sich als natürliche Produktbezeichnung in korrektem Deutsch (Komposita mit Bindestrich: „Ulmenrinde-Drops“), nicht als Keyword-Kette. Lesbarkeit schlägt Keyword-Dichte.",
  },
  {
    id: "title.reihenfolge",
    sektionen: ["title"],
    art: "llm",
    severity: "warning",
    text:
      "Reihenfolge (Best Practice D174): Marke → Hauptkeyword/Produkttyp → wichtigste Key Features → Größe/Menge → Material → Kundennutzen — gekürzt auf das 75er-Budget.",
  },
  // ── Bullets ────────────────────────────────────────────────────────────────
  {
    id: "bullets.headline-benefit",
    sektionen: ["bullets"],
    art: "llm",
    // Best Practice mit Toleranz (Nutzer 23.07./D194): Anatomie ist Richtschnur,
    // kein Dogma — der Gold-Standard nutzt auch Wirkstoff-/Marken-Headlines
    // („ULMENRINDE & NATURMOOR – GEPRÜFTE WIRKSTOFFKOMBINATION“).
    severity: "warning",
    text:
      "Best Practice: Die VERSALIEN-Headline trägt einen KAUFGRUND — ideal als Benefit-Aussage („BLEIBT JAHRELANG SCHARF“); eine begründete Abweichung (Wirkstoff-Kombination, Marken-Versprechen) ist zulässig, eine reine Mengenangabe („350 G MIT 160 DROPS“) nicht.",
  },
  {
    id: "bullets.headline-echo",
    sektionen: ["bullets"],
    art: "llm",
    severity: "error",
    text:
      "Der erste Satz nach dem Doppelpunkt wiederholt die Headline weder wörtlich noch sinngleich — er liefert sofort den Feature-BELEG für die Headline-Aussage (Drei-Positionen-Anatomie).",
  },
  {
    id: "bullets.ein-thema",
    sektionen: ["bullets"],
    art: "llm",
    // Best Practice mit Toleranz (D194): der Gold-Standard bündelt z. B.
    // Dosierung + Packungsgröße + Konsistenz sinnvoll im Anwendungs-Bullet.
    severity: "warning",
    text:
      "Best Practice: EIN Bullet = EIN Thema — jeder Satz stützt die Kernaussage der Headline; sinnvoll zusammengehörende Details (Dosierung + Packungsgröße im Anwendungs-Bullet) sind ok, zusammenhanglose Fakten nicht.",
  },
  {
    id: "bullets.themen-dopplung",
    sektionen: ["bullets"],
    art: "llm",
    severity: "error",
    text:
      "Kein Bullet wiederholt einen anderen INHALTLICH — dieselbe Aussage, derselbe Fakt oder dasselbe Kern-Thema dürfen nicht in zwei Bullets stehen (jede USP, jede Mengenangabe genau EINMAL). Wort-Wiederholungen allein sind KEIN Verstoß (Nutzer-Klarstellung 23.07./D194).",
  },
  {
    id: "bullets.slot-abdeckung",
    sektionen: ["bullets"],
    art: "llm",
    severity: "warning",
    text:
      "Die fünf Bullets decken unterschiedliche Kauf-Fragen ab (Slot-Logik HOOK · PROBLEM→BENEFIT · TRUST · USAGE · CLOSE) — nicht vier Varianten desselben Themas.",
  },
];

/** Alle Regeln, die für eine Sektion gelten (Prompt-Rendering). */
export function regelnFuerSektion(sektion: RegelSektion): Regel[] {
  return REGELN.filter((r) => r.sektionen === "alle" || r.sektionen.includes(sektion));
}

/** Nur die LLM-prüfbaren Regeln (Input fürs Prüfprotokoll des Prüfers). */
export function pruefRegelnFuerSektion(sektion: RegelSektion): Regel[] {
  return regelnFuerSektion(sektion).filter((r) => r.art === "llm");
}

/** Regeltexte als Prompt-Block (nummerierte Gesetze, keine Empfehlungen). */
export function regelnAlsPromptBlock(sektion: RegelSektion): string {
  const regeln = regelnFuerSektion(sektion);
  if (regeln.length === 0) return "";
  return regeln.map((r) => `- [${r.id}] ${r.text}`).join("\n");
}
