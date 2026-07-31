import { eq, desc, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { amazonDomain, SPRACH_NAMEN } from "@/lib/text/sprache";
import { normalisierePayload } from "@/lib/reviews/insights";
import { baueBildBriefing, type BestandsBild, type BildBriefingPayload } from "@/lib/analysis/bildBriefing";
import { erzeugeKonzeptIdeen, lokalisiereBriefing } from "@/lib/analysis/bildBriefingLauf";
import { istBildTyp } from "@/lib/analysis/bildTypen";

/**
 * Erzeugung des Bilder-Briefings (D269): sammelt die vorhandenen Analyse-Zeilen,
 * holt die Konzept-Ideen, assembliert deterministisch und speichert je Sprache.
 *
 * Die englische Fassung entsteht IMMER aus der deutschen — nie direkt aus den
 * Daten. Sonst wären es zwei Briefings, die auseinanderlaufen können, statt
 * einer Fassung in zwei Sprachen.
 */

export type BriefingErgebnis =
  | { ok: true; payload: BildBriefingPayload; hinweise: string[] }
  | { ok: false; grund: string };

export async function erzeugeBildBriefing(productId: string, sprache: "de" | "en"): Promise<BriefingErgebnis> {
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return { ok: false, grund: "Produkt nicht gefunden." };

  const [driverLauf, insightRow, snapshot, marke] = await Promise.all([
    db.query.conversionDrivers.findFirst({
      where: eq(schema.conversionDrivers.productId, productId),
      orderBy: desc(schema.conversionDrivers.createdAt),
    }),
    db.query.reviewInsights.findFirst({
      where: eq(schema.reviewInsights.productId, productId),
      orderBy: desc(schema.reviewInsights.createdAt),
    }),
    db.query.listingSnapshots.findFirst({
      where: eq(schema.listingSnapshots.productId, productId),
      orderBy: desc(schema.listingSnapshots.createdAt),
    }),
    db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) }),
  ]);

  if (!driverLauf) {
    return {
      ok: false,
      grund:
        "Das Bilder-Briefing braucht den Conversion-Driver-Lauf: Es briefed genau die Kaufgründe, die im Bildset nicht bewiesen sind. Bitte den Analyse-Lauf durchlaufen lassen.",
    };
  }

  const insights = insightRow ? normalisierePayload(insightRow.payload) : null;

  // Heutiger Stand je Bild — inklusive „wie besser" aus dem Bild-Audit.
  const bestand: BestandsBild[] = (snapshot?.bilderText ?? []).map((b) => {
    const typ = typeof b.typ === "string" && istBildTyp(b.typ) ? b.typ : null;
    return {
      slot: b.slot,
      typ,
      inhalt: [b.inhalt, ...(b.textImBild ?? [])].filter(Boolean).join(" · ").slice(0, 300),
      design: b.faktoren?.design?.score ?? null,
      botschaft: b.faktoren?.message?.score ?? null,
      klarheit: b.faktoren?.clarity?.score ?? null,
      hinweis: b.faktoren?.message?.wieBesser || b.faktoren?.clarity?.wieBesser || undefined,
    };
  });

  // Marken-Name wie in den Alt-Briefs: bei Werkbank-Aufträgen steckt er im Produktnamen.
  const istWerkbank = marke?.kind === "workbench";
  const markenName = product.marke ?? (istWerkbank && product.name.includes(" — ") ? product.name.split(" — ")[0] : marke?.name ?? "—");
  const produktName = istWerkbank && product.name.includes(" — ") ? product.name.split(" — ").slice(1).join(" — ") : product.name;

  const basis = {
    produkt: produktName,
    marke: markenName,
    asin: product.asin ?? null,
    marktplatz: `amazon.${amazonDomain(product.marketplace)}`,
    listingSprache: SPRACH_NAMEN[product.contentSprache],
    facts: product.facts,
    driver: driverLauf.payload,
    bestand,
    languageToBorrow: insights?.languageToBorrow ?? [],
    languageToAvoid: insights?.languageToAvoid ?? [],
  };

  const hinweise: string[] = [];
  try {
    // Erst ohne Ideen assemblieren, um die Produkt-Wahrheit für den Prompt zu haben.
    const vorlauf = baueBildBriefing(basis);
    const konzepte = await erzeugeKonzeptIdeen({
      produkt: produktName,
      driver: driverLauf.payload,
      produktWahrheit: vorlauf.produktWahrheit,
      sprache: product.contentSprache,
    });
    hinweise.push(...konzepte.hinweise);

    let payload = baueBildBriefing({ ...basis, konzeptIdeen: konzepte.ideen, typVorschlaege: konzepte.typen });

    if (sprache === "en") {
      const lokal = await lokalisiereBriefing(payload);
      payload = lokal.payload;
      hinweise.push(...lokal.hinweise);
      hinweise.push(
        `Produktangaben, Kundenstimmen und der ausgelesene Bildinhalt bleiben ${basis.listingSprache} — sie beziehen sich auf das ${basis.listingSprache}e Listing, das gestaltet wird.`,
      );
    }

    await db.insert(schema.bildBriefings).values({
      id: crypto.randomUUID(),
      productId,
      sprache,
      payload,
      hinweise,
      createdAt: new Date(),
    });
    return { ok: true, payload, hinweise };
  } catch (e) {
    return { ok: false, grund: `Bilder-Briefing: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Neueste Fassung je Sprache — ohne Lauf gibt es ehrlich nichts. */
export async function ladeBildBriefing(productId: string, sprache: "de" | "en") {
  const db = await getDb();
  return (
    (await db.query.bildBriefings.findFirst({
      where: and(eq(schema.bildBriefings.productId, productId), eq(schema.bildBriefings.sprache, sprache)),
      orderBy: desc(schema.bildBriefings.createdAt),
    })) ?? null
  );
}
