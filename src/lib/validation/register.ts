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
 *
 * Ausnahme mit Absicht (D285): `bullets.hauptnutzen` ist als "llm" deklariert,
 * hat aber zusätzlich eine deterministische UNTERGRENZE im Gate
 * (`pruefeHauptnutzen`: Berührt die Headline von Bullet 1 überhaupt das Thema des
 * stärksten Kaufgrunds?). Der Code entscheidet, was er entscheiden kann (D184);
 * ob der Bullet den Haupt-Nutzen wirklich TRÄGT, bleibt eine Bedeutungsfrage.
 */

export type RegelSektion = "title" | "bullets" | "highlights" | "backend" | "description" | "qa" | "familie";

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
      "Fehlerfreies Deutsch: vollständige, grammatisch korrekte Sätze; Substantive groß; keine sinnfreien Wortfolgen. Ein Text, der wie eine aneinandergereihte Suchbegriff-Liste klingt, ist falsch. Groß-/Kleinschreibung mitten im Satz beachten: NUR Satzanfang und Substantive groß — Adjektive und Verben im Satzinneren kleinschreiben (richtig: „kein umständliches Abmessen“, FALSCH: „kein Umständliches Abmessen“). Solche Fehler bereits beim Schreiben vermeiden, nicht erst korrigieren.",
  },
  {
    // D251 (Nutzer-Befund, Screenshot: „Jeder Schluck schmeckt sauber durchgemischt“):
    // Grammatisch korrekt, aber semantisch Unsinn — „sauber“ gehört ins Sinnfeld
    // Reinheit, nicht zu Durchmischung oder Geschmack. sprache.grammatik greift hier
    // NICHT (der Satz IST grammatisch), darum eine eigene Kollokations-Regel.
    id: "sprache.kollokation",
    sektionen: ["title", "bullets", "highlights", "description", "qa"],
    art: "llm",
    severity: "error",
    text:
      "Jedes Adjektiv/Adverb/Verb muss semantisch zu dem passen, was es beschreibt (übliche deutsche Wortverbindung). Ein Wort aus einem FREMDEN Sinnfeld zu übertragen ist falsch — auch wenn der Satz grammatisch korrekt ist. FALSCH: „jeder Schluck schmeckt sauber durchgemischt“ („sauber“ = Reinheit und beschreibt weder Geschmack noch Durchmischung; „schmecken“ verlangt eine Geschmacksangabe). RICHTIG: „löst sich klümpchenfrei auf“, „schmeckt gleichmäßig fruchtig“. Prüfe jede Wortverbindung: Würde ein deutscher Muttersprachler das so sagen? Benutze für jede Eigenschaft das dafür übliche Wort — Löslichkeit: klümpchenfrei/rückstandslos/vollständig; Geschmack: fruchtig/mild/erfrischend; Konsistenz: gleichmäßig/sämig; Reinheit: sauber/rein. Keine Wort-Neuschöpfungen, keine gestapelten Adjektive ohne Sinn.",
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
  {
    // Produkt-Fokus (D200, Screenshot-Befund: Bullet 2 „Wir weisen beide Werte
    // getrennt aus…“, Bullet 3 „Ein Foto … finden Sie in unseren Produktbildern“).
    // Diese Meta-Aussagen verschenken Premium-Platz: kein Nutzen, kein Keyword,
    // kein Produkt-Fakt. Der Prüfer blockt sie → Neu-Generierung mit Produktnutzen.
    id: "sprache.produkt-fokus",
    sektionen: ["bullets", "highlights", "description"],
    art: "llm",
    severity: "error",
    text:
      "Jeder Satz spricht über das PRODUKT und seinen konkreten Nutzen für den Kunden — NICHT über das Listing selbst, die Kennzeichnung/Auszeichnung, die Produktbilder, den Schreib-/Prüfprozess oder den Anbieter-Standpunkt. VERLETZT sind Meta-Aussagen wie „wir weisen … aus“, „ein Foto … finden Sie in unseren Produktbildern“, „diese Transparenz ist uns wichtig(er als …)“, „wir stellen … dar“ — sie liefern keinen Produktnutzen. Erlaubt bleibt die belegte Produkt-Eigenschaft selbst (z. B. „610 mg indischer Flohsamen pro Kapsel“ als Fakt mit Nutzen).",
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
  // ── Item Highlights ────────────────────────────────────────────────────────
  {
    id: "highlights.keine-titel-dopplung",
    sektionen: ["highlights"],
    art: "llm",
    severity: "error",
    text:
      "Item Highlights stehen im Listing DIREKT neben dem Titel und ergänzen ihn um NEUE Informationen — kein Wort, kein Fakt und keine Zahl aus dem Titel darf wiederholt werden (auch nicht sinngleich umformuliert). Dopplung = verschwendeter Premium-Platz.",
  },
  // ── Bullets ────────────────────────────────────────────────────────────────
  {
    id: "bullets.headline-benefit",
    sektionen: ["bullets"],
    art: "llm",
    // Toleranz bleibt im REGELTEXT (D194): Wirkstoff-/Marken-Headlines sind
    // erlaubt — der Prüfer flaggt nur die reine Mengenangabe. Severity von
    // „warning“ → „error“ (Nutzer 23.07./D200, Screenshot-Befund „PRO KAPSEL
    // 610 MG“): eine reine Mengenangabe-Headline blockt jetzt und wird neu
    // geschrieben, statt nur als △ durchgewinkt zu werden. Der Prüfer ist per
    // D193 auf „im Zweifel bestanden“ kalibriert → Loop-Risiko gering.
    severity: "error",
    text:
      "Die VERSALIEN-Headline trägt einen KAUFGRUND — ideal als Benefit-Aussage („BLEIBT JAHRELANG SCHARF“); eine begründete Abweichung (Wirkstoff-Kombination, Marken-Versprechen) ist zulässig. VERLETZT ist NUR eine reine Mengen-/Spec-Angabe ohne Kaufgrund („350 G MIT 160 DROPS“, „PRO KAPSEL 610 MG“) — Zahlen/Dosierung allein sind kein Kaufgrund. Im Zweifel (Wirkstoff, Marke, Nutzen erkennbar) gilt BESTANDEN.",
  },
  {
    /**
     * D285 (Nutzer-Befund 04.08.2026, Screenshot): Bullet 1 eröffnete mit
     * „ERWEITERBAR FÜR JEDE POOLGRÖSSE" — einem Zusatz-Feature. Der Kaufgrund
     * (warmes Poolwasser durch Sonnenkraft, ohne Strom und Gas) kam nirgends
     * zuerst. Ursache: Die Conversion Driver flossen nie in die Generierung
     * (jetzt behoben), und die Slot-Logik nannte für Slot 1 nur „stärkster USP" —
     * ein USP kann auch ein Zusatz-Feature sein.
     *
     * Deterministisch geprüft wird die HEADLINE (Stamm-Abdeckung gegen den
     * stärksten Kaufgrund, gate.ts); ob der Bullet den Haupt-Nutzen wirklich
     * TRÄGT, ist eine Bedeutungsfrage und bleibt beim Prüfer.
     */
    id: "bullets.hauptnutzen",
    sektionen: ["bullets"],
    art: "llm",
    severity: "error",
    text:
      "Der ERSTE Bullet trägt den Haupt-Nutzen: Er sagt, WAS das Produkt ist und WAS es für den Kunden bewirkt (stärkster Kern-Kaufgrund), und zwar bereits in der VERSALIEN-Headline. Wer nur diesen Bullet liest, muss wissen, was er kauft und was er davon hat. VERLETZT ist ein erster Bullet, der mit einem Zusatz-Thema einsteigt — Erweiterbarkeit, Kombinierbarkeit, Kompatibilität, Zubehör, Maße, Mengen, Lieferumfang, Montage — oder der den Kaufgrund erst in einem Nebensatz nennt. Beispiel VERLETZT: „ERWEITERBAR FÜR JEDE POOLGRÖSSE …“ bei einer Solar-Poolheizung, deren Kaufgrund warmes Poolwasser durch Sonnenkraft ist. Beispiel BESTANDEN: „WARMES POOLWASSER ALLEIN DURCH SONNENKRAFT: …“.",
  },
  {
    /**
     * D285 (Nutzer-Befund 04.08.2026): Bullet 2 versprach „DICHTER ANSCHLUSS
     * OHNE ADAPTER-SUCHE … vermeidet undichte Übergänge" — während „undichte
     * Anschlüsse" der häufigste Pain Point der Reviews war (Nutzer: „komplett
     * darauf abgeht, als würde es dort nie Probleme geben").
     *
     * Der Prüfer konnte das nicht sehen: `prueferKontext` enthielt die
     * Bewertungs-Analyse gar nicht. Diese Regel ist deshalb nur zusammen mit
     * dem erweiterten Prüfer-Kontext wirksam (beides in D285).
     */
    id: "inhalt.pain-point-ehrlich",
    sektionen: ["bullets", "description", "qa"],
    art: "llm",
    severity: "error",
    text:
      "Ein in den Reviews belegter Pain Point darf NICHT dementiert werden. VERLETZT ist jede pauschale Entwarnung zu genau dem Thema, das die Kundenstimmen als Problem belegen („dichter Anschluss ohne Adapter-Suche“, „vermeidet undichte Übergänge“, „passt problemlos“, „kein Nachdichten nötig“, wenn undichte Anschlüsse der häufigste Pain Point sind). Zulässig und gewollt ist die ehrliche Rahmung: benennen, was das Produkt konkret dafür mitbringt (Bauteil, Maß, Material, Lieferumfang) UND welche Bedingung dafür gilt (Montage, Zubehör, Prüfen der Passung) — Erwartungsmanagement statt Dementi. Beleg für ein „verletzt“-Verdikt ist das Zitat der Entwarnung plus der Pain Point aus dem Kontext, den sie leugnet.",
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
  // ── Fakten-Sperre: Steigerung über den Messwert (D265) ───────────────────────
  {
    // Deterministisch erzwungen von pruefeClaimStaerke (gate.ts) UND im Prompt,
    // damit der Fehler nicht erst korrigiert, sondern vermieden wird.
    id: "fakten.claim-staerke",
    sektionen: ["title", "bullets", "highlights", "description", "qa"],
    art: "deterministisch",
    severity: "error",
    text:
      "Ein Intensitäts-Wort darf den gemessenen Wert nicht überbieten: bei einem belegten dB-Wert gilt „flüsterleise/lautlos/unhörbar“ nur bis 30 dB, „sehr leise“ bis 40 dB, „leise“ bis 50 dB, „angenehm leise/geräuscharm“ bis 55 dB. Die Zahl ist belegt, die Steigerung darüber ist erfunden — bei ≤ 55 dB ist „angenehm leise“ die belegbare Formulierung, nicht „flüsterleise“.",
  },
  // ── Variations-Familie (D221) ────────────────────────────────────────────────
  {
    // Deterministisch erzwungen von pruefeLockedKonsistenz (master.ts), NICHT im
    // per-Sektion-Prompt gerendert. Sektion „familie" ist orthogonal zu den
    // Content-Sektionen und wird nur von der Familien-Ableitung geprüft.
    id: "familie.locked-konsistent",
    sektionen: ["familie"],
    art: "deterministisch",
    severity: "error",
    text:
      `Slots, die als "für alle Childs gleich" (locked) markiert sind, MÜSSEN in jedem Child einer Variations-Familie byte-identisch sein — geteilte Claims wie "zuckerfrei"/"vegan" gelten für alle Varianten oder für keine, nie nur für einzelne.`,
  },
  {
    id: "familie.token-unaufgeloest",
    sektionen: ["familie"],
    art: "deterministisch",
    severity: "error",
    text: `Kein abgeleiteter Child-Content darf einen unaufgelösten Platzhalter ({{achse}}) enthalten — jeder Token muss durch einen echten Achsenwert ersetzt sein.`,
  },
  {
    id: "familie.achsenwert-fehlt",
    sektionen: ["familie"],
    art: "deterministisch",
    severity: "error",
    text: `Jedes Child muss für JEDE Achse des variationTheme einen Wert tragen — ohne vollständige Achsenwerte kann kein sauberer Varianten-Content abgeleitet werden.`,
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
