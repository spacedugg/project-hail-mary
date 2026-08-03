import { generateForRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";

/**
 * Einordnung der Listing-Merkmale (D282, Nutzer-Befund 02.08.2026).
 *
 * Was vorher schieflief — zwei Fehler übereinander:
 *
 * 1. WORTABGLEICH. „Ballast" entstand als Mengendifferenz: alle Feature-Titel
 *    minus die Features, die in einem Driver-Baustein vorkommen. Verglichen wurde
 *    über `nutzenSchluessel` — einen sortierten Token-Schlüssel, der EXAKT passen
 *    muss. Praktisch passt er nie. Ergebnis im Referenz-Fall: sieben von neun
 *    Merkmalen landeten im „Ballast", darunter „Erwärmt Aufstellpool mit
 *    Sonnenkraft" bei einem Kaufgrund „Poolwasser wird angenehm warm zum Baden".
 *
 * 2. FALSCHE PRÄMISSE. Selbst mit perfektem Abgleich wäre die Aussage falsch.
 *    „Anschluss Ø 38 mm" und „Wasserinhalt 15 Liter" zahlen auf keinen Kaufgrund
 *    ein — sie MÜSSEN aber im Listing stehen: Ohne sie kann niemand prüfen, ob
 *    das Produkt an den eigenen Pool passt. Das ist keine verschwendete
 *    Aufmerksamkeit, das ist Kaufvoraussetzung (Nutzer: „Natürlich zahlen sie
 *    nicht auf die Conversion-Driver ein, aber sie müssen da stehen").
 *
 * Deshalb drei Klassen statt einer Differenzmenge. Die Grenze zwischen
 * „notwendige Spezifikation" und „echter Ballast" ist eine BEDEUTUNGSFRAGE —
 * Code kann sie nicht ziehen, also urteilt das Modell (wie bei der semantischen
 * Abdeckung, D281). Es liefert je Merkmal Klasse und Begründung; der Code
 * erzwingt die Struktur und verwirft alles Unbekannte.
 *
 * Ohne Lauf (kein Key, Zeitlimit) wird NICHTS behauptet: keine Klasse heißt
 * keine Anzeige. Eine falsche Ballast-Behauptung ist schlimmer als keine.
 */

export const MERKMAL_KLASSEN = ["stuetzt_kaufgrund", "notwendige_spezifikation", "ballast"] as const;
export type MerkmalKlasse = (typeof MERKMAL_KLASSEN)[number];

export const KLASSE_LABEL: Record<MerkmalKlasse, string> = {
  stuetzt_kaufgrund: "stützt einen Kaufgrund",
  notwendige_spezifikation: "notwendige Angabe",
  ballast: "ohne erkennbaren Zweck",
};

export type MerkmalUrteil = {
  merkmal: string;
  klasse: MerkmalKlasse;
  /** Ein Satz: warum diese Klasse. Landet unverändert in der Anzeige. */
  begruendung: string;
};

function prompt(merkmale: string[], kaufgruende: string[], sprache: string): string {
  return `Du ordnest die Merkmale eines Amazon-Listings ein (Antwort-Sprache "${sprache}").

DIE KAUFGRÜNDE DIESES PRODUKTS (das Ergebnis, das Käufer erreichen wollen):
${kaufgruende.map((k, i) => `${i + 1}. ${k}`).join("\n") || "(keine ermittelt)"}

DIE MERKMALE IM LISTING:
${merkmale.map((m, i) => `${i + 1}. ${m}`).join("\n")}

AUFGABE: Ordne JEDES Merkmal in GENAU EINE der drei Klassen ein.

"stuetzt_kaufgrund" — das Merkmal trägt zu mindestens einem Kaufgrund oben bei, auch indirekt oder mit anderen Worten. Beispiel: „Erwärmt Aufstellpool mit Sonnenkraft" stützt „Poolwasser wird angenehm warm zum Baden".

"notwendige_spezifikation" — zahlt auf keinen Kaufgrund ein, MUSS aber im Listing stehen, damit Käufer überhaupt kaufen können. Dazu gehören:
· Passung und Kompatibilität (Anschlussmaße, Gewinde, Abmessungen, Gewicht)
· Mengen und Kapazitäten (Füllvolumen, Stückzahl, Reichweite)
· Material und Zertifikate (rechtlich nötig oder vertrauensbildend)
· Anwendungs- und Zubehörhinweise (was man zusätzlich braucht)
· Einschränkungen (wofür es NICHT geeignet ist)

"ballast" — trägt WEDER zu einem Kaufgrund bei NOCH ist es eine notwendige Angabe. Nur echte Platzverschwendung: leere Werbefloskeln („Top-Qualität"), Selbstverständlichkeiten, Wiederholungen desselben Punkts, Aussagen ohne jeden Informationswert.

WICHTIG: „ballast" ist die AUSNAHME, nicht der Normalfall. Ein technisches Datum ist niemals Ballast, nur weil es unspektakulär klingt. Im Zweifel „notwendige_spezifikation".

Je Merkmal eine "begruendung": EIN kurzer Satz, warum diese Klasse.

JSON-Schema (NUR dieses JSON):
{"urteile":[{"merkmal":"wortgleich aus der Liste oben","klasse":"stuetzt_kaufgrund|notwendige_spezifikation|ballast","begruendung":"..."}]}`;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Struktur erzwingen (D103): unbekannte Merkmale und Klassen fliegen raus. */
export function normalisiereUrteile(raw: unknown, merkmale: string[]): { urteile: MerkmalUrteil[]; verworfen: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o.urteile) ? o.urteile : [];
  const bekannt = new Map(merkmale.map((m) => [norm(m), m]));
  const gueltig = new Set<string>(MERKMAL_KLASSEN);

  const urteile: MerkmalUrteil[] = [];
  let verworfen = 0;
  const gesehen = new Set<string>();

  for (const x of liste) {
    const u = (x ?? {}) as Record<string, unknown>;
    const merkmal = bekannt.get(norm(String(u.merkmal ?? "")));
    const klasse = String(u.klasse ?? "").trim();
    if (!merkmal || !gueltig.has(klasse) || gesehen.has(norm(merkmal))) {
      verworfen += 1;
      continue;
    }
    gesehen.add(norm(merkmal));
    urteile.push({
      merkmal,
      klasse: klasse as MerkmalKlasse,
      begruendung: String(u.begruendung ?? "").trim().slice(0, 300),
    });
  }
  return { urteile, verworfen };
}

/**
 * Der Lauf. `null` = keine Einordnung möglich → der Aufrufer behauptet nichts.
 * Kein Mock: ein erfundenes „Ballast"-Urteil würde dem Kunden empfehlen, eine
 * Pflichtangabe aus dem Listing zu streichen.
 */
export async function ordneMerkmaleEin(
  merkmale: string[],
  kaufgruende: string[],
  sprache = "de",
): Promise<{ urteile: MerkmalUrteil[]; verworfen: number } | null> {
  const liste = [...new Set(merkmale.map((m) => m.trim()).filter(Boolean))];
  if (liste.length === 0) return null;
  try {
    const res = await generateForRecipe("listing.merkmal-klasse", {
      messages: [{ role: "user", content: prompt(liste, kaufgruende, sprache) }],
      maxTokens: 3000,
      temperature: 0,
    });
    const roh = parseLlmJson(res.text);
    if (!roh) return null;
    return normalisiereUrteile(roh, liste);
  } catch {
    return null;
  }
}
