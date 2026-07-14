import { NextRequest, NextResponse } from "next/server";
import { eq, desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { buildFlatfileTxt } from "@/lib/flatfile/build";

export const dynamic = "force-dynamic";

/** Flat-File-Download: neuste Vorlage der Marke + aktuellster Content je Produkt. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params;
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  if (!brand) return NextResponse.json({ error: "Marke nicht gefunden" }, { status: 404 });

  const tpl = await db.query.flatfileTemplates.findFirst({
    where: eq(schema.flatfileTemplates.brandId, brandId),
    orderBy: desc(schema.flatfileTemplates.createdAt),
  });
  if (!tpl) return NextResponse.json({ error: "Keine Vorlage hochgeladen" }, { status: 400 });

  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = products.map((p) => p.id);
  const versions = pids.length
    ? await db.query.contentVersions.findMany({ where: inArray(schema.contentVersions.productId, pids), orderBy: desc(schema.contentVersions.createdAt) })
    : [];
  const latest = (pid: string, t: string) =>
    versions.find((v) => v.productId === pid && v.type === t)?.payload as Record<string, unknown> | undefined;

  const rows = products.map((p) => ({
    sku: p.asin ?? p.id.slice(0, 12),
    asin: p.asin,
    brand: brand.name,
    title: (latest(p.id, "title")?.text as string) ?? "",
    bullets: (latest(p.id, "bullets")?.items as string[]) ?? [],
    description: (latest(p.id, "description")?.text as string) ?? "",
    backendKeywords: (latest(p.id, "backend_keywords")?.text as string) ?? "",
    productType: p.facts.productType ?? "",
  }));

  const { content } = buildFlatfileTxt(
    { sheetName: tpl.sheetName, headerRows: tpl.headerRows, fieldNames: tpl.fieldNames },
    rows,
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(content, {
    headers: {
      "content-type": "text/tab-separated-values; charset=utf-8",
      "content-disposition": `attachment; filename="flatfile-${brand.name.replace(/[^a-z0-9]+/gi, "-")}-${date}.txt"`,
    },
  });
}
