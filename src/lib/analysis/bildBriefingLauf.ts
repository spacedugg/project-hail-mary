import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import { BILD_TYPEN, type BildTyp } from "@/lib/analysis/bildTypen";
import { pruefeKonzeptFreiheit, type BildBriefingPayload } from "@/lib/analysis/bildBriefing";
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";

/**
 * LLM-Stufen des Bilder-Briefings (D269) — bewusst zwei kleine Schritte:
 *
 * 1. `erzeugeKonzeptIdeen` — je Kaufgrund EINE Konzept-Idee. Das ist der einzige
 *    kreative Beitrag; alles andere (Auswahl, Reihenfolge, Findings, Verbote,
 *    Bestand) assembliert der Code (D184).
 * 2. `lokalisiereBriefing` — sinngemäße Lokalisierung ins Englische. Kein
 *    Wort-für-Wort-Übersetzen, aber auch keine neuen Aussagen.
 *
 * Beide Stufen laufen gegen deterministische Gates: Konzepte ohne
 * Bildtext-Vorgabe und ohne Szenen-Regie (`pruefeKonzeptFreiheit`), Lokalisierung
 * ohne Antasten der sprachgebundenen Felder.
 */

const istTyp = (v: string): v is BildTyp => (BILD_TYPEN as readonly string[]).includes(v);

const KONZEPT_SYSTEM =
  "Du briefst Produktfotografie für Amazon-Listings. Du sagst, WAS ein Bild transportieren soll — nie, wie es " +
  "gestaltet, ausgeleuchtet oder betextet wird. Antworte AUSSCHLIESSLICH mit validem JSON.";

/**
 * Konzept-Ideen je Kaufgrund. Ein Satz, zwei Höchstens — was soll rüberkommen.
 *
 * Die drei Verbote im Prompt sind dieselben, die `pruefeKonzeptFreiheit`
 * deterministisch nachprüft: Bildtexte, Szenen-Regie, erfundene Belege. Sie
 * stehen hier, damit der Fehler vermieden statt korrigiert wird (QM-Prinzip).
 */
export async function erzeugeKonzeptIdeen(input: {
  produkt: string;
  driver: ConversionDriverPayload;
  produktWahrheit: string[];
  sprache?: string;
}): Promise<{ ideen: Record<string, string>; typen: Record<string, BildTyp>; hinweise: string[] }> {
  const istBildFall = (f: string) => f === "bildbeweis_fehlt" || f === "beweis_schwach";
  const offen = input.driver.blocker.filter((b) => istBildFall(b.fall));
  const relevant = input.driver.driver.filter((d) => offen.some((b) => b.driverId === d.id));
  if (relevant.length === 0) return { ideen: {}, typen: {}, hinweise: [] };

  const { provider } = resolveRecipe("briefing.konzepte");
  if (provider.name === "mock") {
    return {
      ideen: {},
      typen: {},
      hinweise: ["Mock-Lauf (kein API-Key): keine Konzept-Ideen — der Code nutzt die deterministischen Sätze aus dem Befund."],
    };
  }

  const block = relevant
    .map((d) => {
      const luecke = offen.filter((b) => b.driverId === d.id).map((b) => b.titel).join(" · ");
      return `- id "${d.id}" · Kaufgrund: "${d.resultat}"\n  Bausteine: ${d.bausteine.map((b) => b.nutzen).join(" · ")}\n  Lücke: ${luecke}`;
    })
    .join("\n");

  const prompt = `PRODUKT: ${input.produkt}

PRODUKT-WAHRHEIT (nur das ist belegt):
${input.produktWahrheit.length ? input.produktWahrheit.map((z) => `- ${z}`).join("\n") : "(nicht erfasst)"}

KAUFGRÜNDE OHNE BILDBEWEIS:
${block}

AUFGABE (Sprache "${input.sprache ?? "de"}"): Formuliere je id EINE Konzept-Idee: was das Bild beim Betrachter ankommen lassen soll. Ein bis zwei Sätze.
VERBOTEN:
1. Keine Bildtexte, Headlines oder Claims vorschreiben — die setzt der Designer. Schreibe nicht, was auf dem Bild STEHEN soll.
2. Keine Szenen-Regie: kein Licht, keine Perspektive, kein Kamerawinkel, keine Brennweite, kein Bildausschnitt.
3. Keine Angabe erfinden. Nur was oben unter Produkt-Wahrheit oder im Kaufgrund steht.
Zusätzlich je id ein Bildtyp-VORSCHLAG (Verständnis, keine Vorschrift) aus: ${BILD_TYPEN.join(" | ")}.

JSON-Schema:
{"konzepte":[{"id":"...","konzept":"...","typ":"lifestyle_in_use"}]}`;

  const hinweise: string[] = [];
  const res = await llmJsonLauf<{ ideen: Record<string, string>; typen: Record<string, BildTyp>; verworfen: string[] }>({
    recipeKey: "briefing.konzepte",
    system: KONZEPT_SYSTEM,
    prompt,
    maxTokens: 3000,
    temperature: 0,
    kontrakt: (raw) => {
      const liste = Array.isArray(raw.konzepte) ? raw.konzepte : [];
      const bekannt = new Set(relevant.map((d) => d.id));
      const ideen: Record<string, string> = {};
      const typen: Record<string, BildTyp> = {};
      const verworfen: string[] = [];
      for (const x of liste) {
        const o = (x ?? {}) as Record<string, unknown>;
        const id = String(o.id ?? "").trim();
        const konzept = String(o.konzept ?? "").trim();
        if (!bekannt.has(id) || konzept.length < 12) continue;
        const frei = pruefeKonzeptFreiheit(konzept);
        if (!frei.ok) {
          verworfen.push(`${id}: ${frei.verstoesse.join("; ")}`);
          continue;
        }
        ideen[id] = konzept.slice(0, 400);
        const typ = String(o.typ ?? "").trim().toLowerCase();
        if (istTyp(typ)) typen[id] = typ;
      }
      // Nur wenn ALLES an der Konzept-Freiheit scheitert, lohnt ein neuer Versuch.
      return Object.keys(ideen).length === 0 && verworfen.length > 0
        ? {
            verstoesse: [
              `Alle Konzepte wurden abgewiesen: ${verworfen.join(" | ")}. Beschreibe NUR, was ankommen soll — keine Bildtexte, keine Licht- oder Perspektiv-Angaben.`,
            ],
          }
        : { wert: { ideen, typen, verworfen } };
    },
  });

  if (res.verworfen.length) {
    hinweise.push(
      `${res.verworfen.length} Konzept-Idee(n) abgewiesen (Bildtext- oder Regie-Vorgabe) — dort steht der deterministische Satz aus dem Befund.`,
    );
  }
  return { ideen: res.ideen, typen: res.typen, hinweise };
}

const LOKAL_SYSTEM =
  "Du lokalisierst Design-Briefings für Amazon-Listings ins Englische. Sinngemäß und idiomatisch, nie Wort für Wort. " +
  "Du fügst nichts hinzu und lässt nichts weg. Antworte AUSSCHLIESSLICH mit validem JSON.";

/**
 * Englische Fassung eines Briefings (Nutzer-Vorgabe 31.07.).
 *
 * SPRACHGEBUNDEN und deshalb unangetastet: Produkt-Wahrheit, Kundensprache und
 * der ausgelesene Bildinhalt. Ein englischsprachiger Designer gestaltet hier ein
 * DEUTSCHES Listing — Kundenzitate und Produktangaben beziehen sich auf dieses
 * Listing, und übersetzt wären sie kein Beleg mehr. Der Code kopiert diese Felder
 * einfach durch; das LLM sieht sie nur als Kontext, nie als Übersetzungsauftrag.
 */
export async function lokalisiereBriefing(
  de: BildBriefingPayload,
): Promise<{ payload: BildBriefingPayload; hinweise: string[] }> {
  const { provider } = resolveRecipe("briefing.lokalisierung");
  if (provider.name === "mock") {
    return {
      payload: { ...de, sprache: "en" },
      hinweise: ["Mock-Lauf (kein API-Key): englische Fassung nicht erzeugt — angezeigt wird der deutsche Inhalt."],
    };
  }

  const prompt = `Localise this image briefing into English for a designer who does NOT speak German but is designing for a ${de.kopf.listingSprache} Amazon listing.

Translate meaning, not words. Use natural English wording a creative director would use.
Do NOT add claims, do NOT drop items, do NOT prescribe image copy, lighting or camera angles.

BRIEFING (JSON):
${JSON.stringify(
  {
    auftrag: de.auftrag,
    verboten: de.verboten,
    konzepte: de.konzepte.map((k) => ({ id: k.id, resultat: k.resultat, konzept: k.konzept, findings: k.findings })),
    grenzen: de.grenzen,
  },
  null,
  1,
).slice(0, 12000)}

CONTEXT — do NOT translate, these stay German because they quote the German listing:
${JSON.stringify({ produktWahrheit: de.produktWahrheit, kundensprache: de.kundensprache }).slice(0, 3000)}

JSON-Schema (same ids, same order, same number of items):
{"auftrag":"...","verboten":["..."],"konzepte":[{"id":"...","resultat":"...","konzept":"...","findings":["..."]}],"grenzen":["..."]}`;

  const strings = (v: unknown, max: number): string[] =>
    (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max);

  const en = await llmJsonLauf<{
    auftrag: string;
    verboten: string[];
    konzepte: Array<{ id: string; resultat: string; konzept: string; findings: string[] }>;
    grenzen: string[];
  }>({
    recipeKey: "briefing.lokalisierung",
    system: LOKAL_SYSTEM,
    prompt,
    maxTokens: 4000,
    temperature: 0,
    kontrakt: (raw) => {
      const auftrag = String(raw.auftrag ?? "").trim();
      const liste = Array.isArray(raw.konzepte) ? raw.konzepte : [];
      const bekannt = new Map(de.konzepte.map((k) => [k.id, k]));
      const konzepte = liste
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          const id = String(o.id ?? "").trim();
          const original = bekannt.get(id);
          const konzept = String(o.konzept ?? "").trim();
          if (!original || konzept.length < 8) return null;
          // Die Konzept-Freiheit gilt auch in der englischen Fassung.
          if (!pruefeKonzeptFreiheit(konzept).ok) return null;
          return {
            id,
            resultat: String(o.resultat ?? "").trim() || original.resultat,
            konzept,
            findings: strings(o.findings, original.findings.length || 3),
          };
        })
        .filter((k): k is NonNullable<typeof k> => k !== null);

      // Vollständigkeit erzwingen: eine englische Fassung, in der Konzepte
      // fehlen, wäre ein anderes Briefing — nicht dasselbe in anderer Sprache.
      if (!auftrag || konzepte.length !== de.konzepte.length) {
        return {
          verstoesse: [
            `Die englische Fassung muss GENAU ${de.konzepte.length} Konzept(e) mit denselben ids enthalten und einen auftrag-Satz — geliefert: ${konzepte.length} Konzept(e)${auftrag ? "" : ", kein auftrag"}.`,
          ],
        };
      }
      return {
        wert: {
          auftrag,
          verboten: strings(raw.verboten, de.verboten.length),
          konzepte,
          grenzen: strings(raw.grenzen, de.grenzen.length),
        },
      };
    },
  });

  const nachId = new Map(en.konzepte.map((k) => [k.id, k]));
  return {
    payload: {
      ...de,
      sprache: "en",
      auftrag: en.auftrag,
      verboten: en.verboten.length ? en.verboten : de.verboten,
      grenzen: en.grenzen.length ? en.grenzen : de.grenzen,
      konzepte: de.konzepte.map((k) => {
        const t = nachId.get(k.id);
        return t ? { ...k, resultat: t.resultat, konzept: t.konzept, findings: t.findings.length ? t.findings : k.findings } : k;
      }),
      // Unangetastet — sprachgebunden (siehe Kopfkommentar).
      produktWahrheit: de.produktWahrheit,
      kundensprache: de.kundensprache,
      bestand: de.bestand,
    },
    hinweise: [],
  };
}
