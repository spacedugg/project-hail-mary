/**
 * Produkt-Fakten-Autofill (D70): Die Fakten-Felder werden NICHT von Hand
 * getippt, sondern nach dem Listing-Import automatisch aus Titel/Bullets/
 * Beschreibung extrahiert (LLM, temperature 0) — der Nutzer prüft und
 * korrigiert nur noch. Es werden ausschließlich LEERE Felder gefüllt;
 * Hand-Einträge gewinnen immer. Ohne API-Key: kein Autofill (kein Mock —
 * erfundene Fakten wären Gift für Reference-Fidelity).
 */

import type { ProductFacts } from "@/db/schema";
import { llmJsonLauf } from "@/lib/llm/qmLauf";

export async function extractFactsFromListing(
  listing: {
    title: string | null;
    bullets: string[] | null;
    description: string | null;
    /** Erweiterte Quellen (D145) — strukturierte Attribute schlagen Fließtext als Fakten-Quelle. */
    attributes?: Record<string, string> | null;
    importantInfo?: string | null;
  },
  existing: ProductFacts,
): Promise<ProductFacts | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const attrText = listing.attributes
    ? Object.entries(listing.attributes).map(([k, v]) => `${k}: ${v}`).join("\n")
    : "";
  const text = [
    listing.title ?? "",
    ...(listing.bullets ?? []),
    attrText ? `PRODUKTINFORMATION (strukturiert):\n${attrText}` : "",
    listing.importantInfo ? `WICHTIGE INFORMATIONEN:\n${listing.importantInfo.slice(0, 2000)}` : "",
    (listing.description ?? "").slice(0, 2000),
  ]
    .filter(Boolean)
    .join("\n");
  if (text.trim().length < 40) return null;

  // QM-Lauf (D182/D183): mindestens die geforderten Schlüssel müssen da sein
  // (alle Felder LEER ist ein gültiges Ergebnis — nichts erfinden).
  const raw = await llmJsonLauf<Partial<Record<keyof ProductFacts, unknown>>>({
    recipeKey: "facts.extract",
    system:
      "Du extrahierst Produkt-Fakten aus einem Amazon-Listing. NUR belegte Fakten aus dem Text — nichts erfinden, " +
      "keine Werbesprache. Begriffe WORTWÖRTLICH übernehmen — NIE übersetzen oder eindeutschen " +
      "(steht im Listing ‚Drops', heißt es ‚Drops', nicht ‚Tropfen'; D149). Antworte NUR mit JSON.",
    prompt:
      `Listing-Text:\n${text}\n\n` +
      'Extrahiere als JSON: {"productType": string (Gattungsbegriff mit der WÖRTLICHEN Produktbezeichnung aus dem Listing, z. B. "Trinkflasche"; ' +
      'bei fremdsprachigen Bezeichnungen die Original-Bezeichnung behalten), ' +
      '"dimensions": string (Maße/Menge/Volumen, wie im Text), ' +
      '"materials": string[] (ehrlich, inkl. Hybride), ' +
      '"usps": string[] (max. 5 konkrete, belegte Produktvorteile — keine Floskeln), ' +
      '"targetAudience": string (für wen laut Text: Nutzungskontext/Zielgruppe), ' +
      '"certifications": string[] (NUR explizit genannte Siegel/Normen)}. ' +
      "Felder ohne Beleg im Text: leer lassen (\"\" bzw. []).",
    maxTokens: 1200,
    temperature: 0,
    kontrakt: (p) => {
      const erwartete = ["productType", "dimensions", "materials", "usps", "targetAudience", "certifications"];
      return erwartete.some((k) => k in p)
        ? { wert: p as Partial<Record<keyof ProductFacts, unknown>> }
        : { verstoesse: [`Die Antwort enthält keinen der geforderten Schlüssel (${erwartete.join(", ")}) — liefere exakt das geforderte JSON-Format, unbelegte Felder leer.`] };
    },
  });

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x.length > 1).slice(0, 8) : [];

  // Nur leere Felder füllen — Hand-Einträge gewinnen immer
  return {
    ...existing,
    productType: existing.productType || str(raw.productType),
    dimensions: existing.dimensions || str(raw.dimensions),
    materials: existing.materials?.length ? existing.materials : arr(raw.materials),
    usps: existing.usps?.length ? existing.usps : arr(raw.usps).slice(0, 5),
    targetAudience: existing.targetAudience || str(raw.targetAudience),
    certifications: existing.certifications?.length ? existing.certifications : arr(raw.certifications),
  };
}
