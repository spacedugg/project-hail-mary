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
      "Keine unbelegten Gesundheits- oder Wirkversprechen („heilt“, „reduziert [Symptom]“, „stärkt das Immunsystem“, „gegen [Beschwerde]“ als Wirkzusage). Zulässig sind Zweckangaben nur, wenn sie wörtlich aus den Quellen dieses Prompts stammen.",
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
    severity: "error",
    text:
      "Jede VERSALIEN-Headline ist eine kurze BENEFIT-Aussage, NIE ein Feature-Name oder eine Mengenangabe („BLEIBT JAHRELANG SCHARF“, nicht „GEHÄRTETER EDELSTAHL“ oder „350 G MIT 160 DROPS“).",
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
    severity: "error",
    text:
      "EIN Bullet = EIN Thema: Jeder Satz eines Bullets belegt die Kernaussage seiner Headline. Fachfremde Fakten (z. B. Packungsgröße im Wirkungs-Bullet) gehören in einen anderen Bullet oder fallen weg.",
  },
  {
    id: "bullets.themen-dopplung",
    sektionen: ["bullets"],
    art: "llm",
    severity: "error",
    text:
      "Kein Bullet wiederholt Aussagen, Zutaten-Aufzählungen oder Fakten eines anderen Bullets — jede USP, jede Zutat-Nennung als Beleg und jede Mengenangabe genau EINMAL über alle fünf Bullets.",
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
