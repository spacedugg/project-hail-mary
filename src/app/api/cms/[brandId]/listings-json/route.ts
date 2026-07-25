import { NextRequest, NextResponse } from "next/server";
import { ladeMarkenCms } from "@/lib/cms/laden";
import { buildListingsPatchRequest, buildListingsRequestMeta } from "@/lib/amazon/listingsPayload";
import { pruefePublish } from "@/lib/amazon/publishGate";

export const dynamic = "force-dynamic";

/**
 * SP-API-Payload als Datei (docs/amazon-content-contract.md §3).
 *
 * Der Payload existiert schon vor der SP-API-Zulassung: prüfbar, versendbar an
 * einen Entwickler, vorzeigbar im Kundengespräch. Mitgeliefert werden Aufruf,
 * Query-Parameter und die offenen Punkte je Produkt — damit die Datei ohne
 * Zusatzwissen benutzbar ist.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ brandId: string }> }) {
  const { getSessionUser } = await import("@/lib/auth/session");
  if (!(await getSessionUser())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { brandId } = await ctx.params;
  const nurProdukt = req.nextUrl.searchParams.get("productId");
  const cms = await ladeMarkenCms(brandId);
  if (!cms) return NextResponse.json({ error: "Marke nicht gefunden" }, { status: 404 });

  const produkte = cms.produkte.filter((p) => !nurProdukt || p.id === nurProdukt);
  if (produkte.length === 0) return NextResponse.json({ error: "Kein Produkt gefunden" }, { status: 404 });

  const inhalt = {
    hinweis:
      "SP-API Listings Items 2021-08-01. Pflicht-Vorlauf: derselbe Aufruf mit mode=VALIDATION_PREVIEW (verändert nichts). " +
      "Amazons Antwort ACCEPTED bedeutet 'angenommen zur Verarbeitung', NICHT 'live' — der Beweis kommt aus dem Soll/Ist-Abgleich.",
    erzeugtAm: new Date().toISOString(),
    marke: cms.brand.name,
    produkte: produkte.map((p) => {
      const meta = buildListingsRequestMeta("{sellerId}", p.publish, "VALIDATION_PREVIEW");
      return {
        produkt: p.name,
        asin: p.asin,
        sku: p.publish.sku,
        marktplatz: p.marketplace,
        aufruf: { methode: meta.method, pfad: meta.path, query: meta.query },
        body: buildListingsPatchRequest(p.publish),
        offenePunkte: pruefePublish(p.publish, { fuerApi: true }).map((i) => ({
          schwere: i.severity,
          quelle: i.quelle,
          meldung: i.message,
        })),
      };
    }),
  };

  const datum = new Date().toISOString().slice(0, 10);
  const name = cms.brand.name.replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(JSON.stringify(inhalt, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="listings-payload-${name}-${datum}.json"`,
    },
  });
}
