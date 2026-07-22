import type { ProductFacts, ReviewInsightsPayload } from "@/db/schema";
import type { ListingAnalysis, ListingSnapshot } from "./listingAudit";

/**
 * Bild-/A+-Brief — deterministisch aus den Analyse-Daten assembliert
 * (Struktur: temoa-audit image-brief, SALVAGE §7), inkl. der zwei
 * VALIDATION-Regeln aus content-knowledge-system.md:
 *  - Reference-Fidelity-Lock (Material-Wahrheit aus ProductFacts)
 *  - Spelling-Risk (max 12 Zeichen/Wort auf Bild-Headlines, Code-erzwungen)
 * Kein LLM nötig — der Brief ist Datenaufbereitung, kein Kreativ-Raten.
 */

/** Spelling-Risk: Headline bild-tauglich machen (12-Zeichen-Regel je Wort). */
export function spellingSafe(headline: string): { safe: string; changed: boolean } {
  const SUBS: Record<string, string> = {
    BEWEGUNGSMELDER: "PIR-SENSOR",
    VERARBEITUNG: "QUALITÄT",
    HANDWERKSQUALITÄT: "HANDWERK",
    SPÜLMASCHINENFEST: "SPÜLFEST",
    LIEFERUMFANG: "IM SET",
  };
  let changed = false;
  const words = headline.split(/\s+/).map((w) => {
    const key = w.toUpperCase().replace(/[^A-ZÄÖÜ-]/g, "");
    if (SUBS[key]) { changed = true; return SUBS[key]; }
    if (w.length > 12) {
      changed = true;
      // Komposita am Bindestrich lassen, sonst hart kürzen
      if (w.includes("-")) return w;
      return w.slice(0, 11) + "·";
    }
    return w;
  });
  return { safe: words.join(" "), changed };
}

export function buildImageBrief(input: {
  brand: string;
  productName: string;
  asin: string | null;
  facts: ProductFacts;
  snapshot: ListingSnapshot;
  analysis: ListingAnalysis;
  reviewInsights?: ReviewInsightsPayload | null;
}): string {
  const { brand, productName, asin, facts, snapshot, analysis, reviewInsights } = input;

  const headlines = snapshot.bullets
    .map((b) => (b.split(":")[0] ?? "").trim())
    .filter(Boolean)
    .map((h) => ({ original: h, ...spellingSafe(h) }));

  const topFindings = analysis.recommendations.slice(0, 3);
  const pains = (reviewInsights?.painPoints ?? []).slice(0, 3);
  const borrow = (reviewInsights?.languageToBorrow ?? []).slice(0, 4);
  const avoid = (reviewInsights?.languageToAvoid ?? []).slice(0, 4);
  // D134: Der Brief zitiert die verdichteten Erkenntnisse SAMT ihrer Bild-Ideen —
  // der Grafiker sieht: DIESER Kaufgrund → DIESE Bildidee (Ideen sind bereits
  // durch den Wahrheits-Filter gelaufen).
  const cards = (reviewInsights?.insightCards ?? []).slice(0, 6);
  const cardsBlock = cards.length
    ? cards
        .map(
          (c) =>
            `- **${c.titel}** (Relevanz ${c.relevanz}/5, Beleg: ${c.belegAspekte.map((b) => `„${b.label}"${b.mentionCount ? ` ${b.mentionCount}×` : ""}`).join(" + ")})\n${c.bildIdeen.map((idee) => `    · Bild-Idee: ${idee}`).join("\n") || "    · (keine zulässige Bild-Idee — Ideen ggf. vom Wahrheits-Filter entfernt)"}`,
        )
        .join("\n")
    : "⚠️ Noch keine verdichteten Erkenntnisse — Verdichtungs-Etappe der Bewertungs-Analyse ausführen.";

  return `# Creative Brief — ${asin ?? "NEU"} (${brand} ${productName})

**Marketplace:** amazon.de · **Tone:** Premium-deutsch, nüchtern · **Quelle:** hail-mary Listing-Analyse (${analysis.overall !== null ? `Score ${analysis.overall}/100` : "noch ohne messbaren Content"})

---

## 1. Produkt-Wahrheit (überschreibt alles — Reference-Fidelity-Lock)

**Titel (NEU, optimiert):**
> ${snapshot.title || "(noch nicht generiert)"}

**Materialien (EHRLICH, Hybride beidseitig — NIE „STATT X" wenn X enthalten ist):** ${facts.materials?.join(" + ") || "(nicht erfasst — vor Bildproduktion erfassen!)"}
${facts.dimensions ? `**Maße:** ${facts.dimensions}` : ""}
${facts.certifications?.length ? `**Nur diese Siegel/Normen zeigen:** ${facts.certifications.join(", ")}` : "**Keine Siegel erfunden** — keins erfasst."}

---

## 2. Top-Findings der Analyse → Bild-Konsequenz

${topFindings.length ? topFindings.map((f, i) => `${i + 1}. ${f}`).join("\n") : "Keine kritischen Findings — Fokus auf USP-Inszenierung."}

---

## 3. Headlines für Bilder (verbatim aus Bullets, spelling-safe)

Jede USP genau EINMAL im Bildset — keine Wiederholung über Bilder hinweg.

${headlines.map((h) => (h.changed ? `- „${h.original}" → Bild-tauglich: **„${h.safe}"**` : `- **„${h.original}"** ✓`)).join("\n") || "- (Bullets zuerst generieren)"}

---

## 4. Pain Points → Szenen-Ideen (Lifestyle)

${pains.length ? pains.map((p) => `- **${p.label}**${p.frequencyPct ? ` (${p.frequencyPct} %)` : ""} — Szene: Situation zeigen, in der das Problem sichtbar gelöst ist. O-Ton: ${p.quotes[0] ? `„${p.quotes[0]}"` : "—"}`).join("\n") : "⚠️ Keine Review-Insights vorhanden — Szenen ohne Kundendaten-Basis."}

---

## 4b. Verdichtete Erkenntnisse → Bild-Ideen (aus der Bewertungs-Analyse)

Jede Erkenntnis nennt ihre Belege aus echten Reviews; die Bild-Ideen sind durch den Wahrheits-Filter gelaufen (keine erfundenen Experten-Zitate, Testimonials oder Siegel).

${cardsBlock}

---

## 5. Kundensprache

${borrow.length ? `**Übernehmen (verbatim-nah):** ${borrow.map((b) => `„${b}"`).join(" · ")}` : ""}
${avoid.length ? `**Vermeiden:** ${avoid.join(" · ")}` : "**Vermeiden:** generische Adjektive ohne Zahl/Material, englische Marketing-Floskeln."}

---

## 6. ABSOLUTE FORBIDDEN (Amazon-TOS + Brand)

1. **Hauptbild:** reines Weiß, NUR Produkt — kein Text, keine Badges, keine Verpackung.
2. Wettbewerber-Markennamen NIE auf Bildern.
3. Keine Trust-Siegel Dritter (Stiftung Warentest etc.) einfügen.
4. Klein-Print auf Produkt: nur echtes ${brand}-Logo oder leer — nie erfinden.
5. Material-/Farb-Claims müssen mit Referenzfotos übereinstimmen (Fidelity-Checkliste in Abschnitt 1).

---

## 7. Slot-Plan (7 Bilder)

1. **Hauptbild** — Produkt freigestellt, ≥85 % Bildfläche, reines Weiß.
2. **Lifestyle + Top-Benefit** — Headline 1, Zielgruppe: ${facts.targetAudience ?? "(Zielgruppe erfassen)"}.
3. **Spec-Callout** — größte Zahl des Produkts groß (${facts.dimensions ?? "Maße"}).
4. **Set/Übersicht** — Lieferumfang flat-lay.
5. **Anwendung** — Produkt in Aktion (Pain-Point-Szene aus Abschnitt 4).
6. **Vergleich/Differenzierung** — Lücke visualisieren, OHNE Markennennung.
7. **Trust/Qualität** — Material-Nahaufnahme, ehrlich (Abschnitt 1).
`;
}
