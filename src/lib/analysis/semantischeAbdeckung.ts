import { generateForRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { TEXT_KANAELE, type TextKanal } from "@/lib/analysis/abdeckung";
import type { FeatureQuellen } from "@/lib/analysis/featureRanking";

/**
 * Semantische Abdeckungs-Prüfung (D281, Nutzer-Vorgabe 02.08.2026).
 *
 * Das Problem, das sie löst: Bis hierher entschied ein WORTSTAMM-Abgleich
 * (`adressiert`, listingAudit.ts), ob ein Nutzen im Listing vorkommt. Der
 * scheitert genau dort, wo es zählt — an Synonymen und Umschreibungen. Im
 * Referenz-Fall stand „präzise Sonnenausrichtung" im Listing, der Nutzen hieß
 * „optimale Ausrichtung zur Sonne", und der Abgleich meldete FEHLT. Ergebnis:
 * ein Conversion-Blocker für etwas, das längst dasteht (Nutzer: „Wie kann das
 * ein Conversion Blocker sein, wenn das mit anderen Worten schon erwähnt ist?
 * … Wortvergleiche sind totaler Quatsch, du musst das inhaltlich verstehen").
 *
 * Warum hier ein LLM richtig ist, obwohl D184 gilt: Semantische Äquivalenz ist
 * genau das, was Code NICHT entscheiden kann. Das Modell liefert aber kein
 * fertiges Urteil, sondern einen BAUSTEIN — je Treffer ein wörtliches Zitat aus
 * dem Kanal. Dieses Zitat wird deterministisch gegen den Quelltext verifiziert
 * (gleiches Muster wie die Beleg-Prüfung im Feature-Ranking, D133): Was sich
 * nicht wörtlich wiederfindet, fliegt raus. Das Modell kann also erkennen, aber
 * nicht behaupten.
 *
 * Anwendung ist bewusst ADDITIV (siehe `verschmelzeAbdeckung`): Ein Nutzen gilt
 * als adressiert, wenn ihn der Wortabgleich ODER die semantische Prüfung mit
 * verifiziertem Zitat findet. Damit kann das Ergebnis nur BESSER werden — die
 * Prüfung erzeugt nie eine Lücke, sie kann nur eine falsche auflösen. Fällt der
 * LLM-Aufruf aus (kein Key, Zeitlimit), bleibt exakt das bisherige Verhalten.
 */

/** Ein verifizierter semantischer Treffer: Kanal + wörtlicher Beleg. */
export type SemantischerTreffer = {
  nutzen: string;
  kanal: TextKanal;
  /** Wörtlicher Ausschnitt aus dem Kanal — gegen den Quelltext geprüft. */
  zitat: string;
};

/** Für Vergleiche: Kleinschreibung, Umlaute aufgelöst, Satzzeichen und Mehrfach-Leerzeichen weg. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Kanal-Texte in der Form, die Prompt und Verifikation gemeinsam nutzen. */
export function kanalTexte(q: FeatureQuellen): Record<TextKanal, string> {
  return {
    title: q.title ?? "",
    bullets: q.bullets.join("\n"),
    description: q.description ?? "",
    attributes: q.attributes ? Object.entries(q.attributes).map(([k, v]) => `${k}: ${v}`).join("\n") : "",
    important_info: q.importantInfo ?? "",
    aplus: q.aplusContent ?? "",
  };
}

function prompt(texte: Record<TextKanal, string>, nutzen: string[], sprache: string): string {
  const kanalBlock = TEXT_KANAELE.filter((k) => texte[k].trim())
    .map((k) => `### KANAL "${k}"\n${texte[k].slice(0, 4000)}`)
    .join("\n\n");
  const liste = nutzen.map((n, i) => `${i + 1}. ${n}`).join("\n");

  return `Du prüfst, ob ein Produkt-Listing bestimmte NUTZEN inhaltlich anspricht (Antwort-Sprache "${sprache}").

LISTING-KANÄLE:
${kanalBlock}

ZU PRÜFENDE NUTZEN:
${liste}

AUFGABE: Entscheide je Nutzen und je Kanal, ob der Kanal diesen Nutzen INHALTLICH anspricht.

REGELN:
· INHALTLICH heißt: sinngemäß, nicht wortgleich. „Präzise Sonnenausrichtung" spricht „optimale Ausrichtung zur Sonne" an. „Hält 80 kg" spricht „trägt auch schwere Monitore" an.
· Ein MERKMAL allein ist noch kein Nutzen: „Bogen-Design" allein spricht „schnellere Erwärmung" NICHT an — es sei denn, der Text stellt den Zusammenhang selbst her.
· Nur ECHTE Treffer melden. Im Zweifel NICHT melden — eine erfundene Abdeckung lässt ein echtes Problem verschwinden.
· Je Treffer ein "zitat": ein WORTWÖRTLICHER, zusammenhängender Ausschnitt (3–15 Wörter) aus GENAU diesem Kanal. Der Ausschnitt wird programmatisch gegen den Text geprüft — paraphrasieren lässt den Treffer platzen.
· Kanäle ohne Treffer einfach weglassen. Nutzen ohne jeden Treffer weglassen.

JSON-Schema (NUR dieses JSON, nichts davor oder danach):
{"treffer":[{"nutzen":"wortgleich aus der Liste oben","kanal":"title|bullets|description|attributes|important_info|aplus","zitat":"wörtlicher Ausschnitt"}]}`;
}

/**
 * Struktur erzwingen + Zitate verifizieren (D103/D133-Muster).
 * Ein Treffer überlebt nur, wenn Nutzen und Kanal bekannt sind UND das Zitat
 * wirklich im Kanal-Text steht.
 */
export function normalisiereTreffer(
  raw: unknown,
  texte: Record<TextKanal, string>,
  nutzen: string[],
): { treffer: SemantischerTreffer[]; verworfen: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o.treffer) ? o.treffer : [];
  const gueltigeKanaele = new Set<string>(TEXT_KANAELE);
  const nutzenNorm = new Map(nutzen.map((n) => [norm(n), n]));
  const normTexte = Object.fromEntries(TEXT_KANAELE.map((k) => [k, norm(texte[k])])) as Record<TextKanal, string>;

  const treffer: SemantischerTreffer[] = [];
  let verworfen = 0;

  for (const x of liste) {
    const t = (x ?? {}) as Record<string, unknown>;
    const kanal = String(t.kanal ?? "").trim() as TextKanal;
    const zitat = String(t.zitat ?? "").trim();
    const nutzenTreffer = nutzenNorm.get(norm(String(t.nutzen ?? "")));

    if (!nutzenTreffer || !gueltigeKanaele.has(kanal) || zitat.length < 3) {
      verworfen += 1;
      continue;
    }
    // Verbatim-Gate: Steht das Zitat wirklich in DIESEM Kanal?
    if (!normTexte[kanal].includes(norm(zitat))) {
      verworfen += 1;
      continue;
    }
    treffer.push({ nutzen: nutzenTreffer, kanal, zitat: zitat.slice(0, 200) });
  }

  // Je Nutzen und Kanal nur ein Treffer.
  const gesehen = new Set<string>();
  const eindeutig = treffer.filter((t) => {
    const key = `${norm(t.nutzen)}|${t.kanal}`;
    if (gesehen.has(key)) return false;
    gesehen.add(key);
    return true;
  });

  return { treffer: eindeutig, verworfen };
}

/**
 * Der Lauf. Gibt `null` zurück, wenn keine Prüfung möglich war (kein Key,
 * kaputte Antwort, Zeitlimit) — der Aufrufer bleibt dann beim Wortabgleich.
 * Niemals ein Mock: eine erfundene Abdeckung würde echte Blocker verschlucken.
 */
export async function pruefeSemantischeAbdeckung(
  quellen: FeatureQuellen,
  nutzen: string[],
  sprache = "de",
): Promise<{ treffer: SemantischerTreffer[]; verworfen: number } | null> {
  const eindeutigerNutzen = [...new Set(nutzen.map((n) => n.trim()).filter(Boolean))];
  if (eindeutigerNutzen.length === 0) return null;

  const texte = kanalTexte(quellen);
  if (TEXT_KANAELE.every((k) => !texte[k].trim())) return null;

  try {
    const res = await generateForRecipe("listing.semantische-abdeckung", {
      messages: [{ role: "user", content: prompt(texte, eindeutigerNutzen, sprache) }],
      maxTokens: 4000,
      temperature: 0,
    });
    const roh = parseLlmJson(res.text);
    if (!roh) return null;
    return normalisiereTreffer(roh, texte, eindeutigerNutzen);
  } catch {
    return null;
  }
}

/**
 * Semantische Treffer in eine bestehende Kanal-Bewertung einweben.
 *
 * ADDITIV: Ein Kanal, den der Wortabgleich als „fehlt" führt, für den es aber
 * einen verifizierten semantischen Treffer gibt, wird hochgestuft. Bereits
 * gefundene Treffer bleiben unberührt — die Prüfung stuft NIE ab. So kann sie
 * nur falsche Lücken auflösen, nie neue erfinden.
 *
 * `title` und der erste Bullet gelten wie im Wortabgleich als prominent; alle
 * anderen Kanäle als „erwähnt“.
 */
export function verschmelzeAbdeckung<T extends { kanal: TextKanal; stufe: string; treffer: string[] }>(
  kanaele: T[],
  semantisch: SemantischerTreffer[],
): T[] {
  if (semantisch.length === 0) return kanaele;
  const jeKanal = new Map(semantisch.map((s) => [s.kanal, s]));
  return kanaele.map((k) => {
    const s = jeKanal.get(k.kanal);
    if (!s) return k;
    if (k.stufe !== "fehlt" && k.stufe !== "nicht_erfasst") return k;
    return {
      ...k,
      stufe: k.kanal === "title" ? "prominent" : "erwaehnt",
      treffer: [...k.treffer, s.zitat],
    };
  });
}
