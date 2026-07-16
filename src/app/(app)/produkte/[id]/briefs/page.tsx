import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { analyzeListing, type ListingSnapshot } from "@/lib/analysis/listingAudit";
import { buildImageBrief } from "@/lib/analysis/imageBrief";
import { buildAplusBrief, buildStoreConcept } from "@/lib/analysis/creativeBriefs";
import type { SovAudit } from "@/lib/sov/audit";

export const dynamic = "force-dynamic";

/**
 * Creative-Briefs (D68): die finalen Outputs für Designer/Bildgen —
 * Listing-Bilder-Brief, A+-Brief, Brand-Store-Konzept. Das Tool erstellt
 * keine Bilder; es liefert das Konzept mit allen Richtlinien, Specs,
 * Brand- und Produktinformationen. Druckfreundlich, copy-paste-fertig.
 */
export default async function BriefsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });

  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, id),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latest = (t: string) =>
    (versions.find((v) => v.type === t && v.status === "approved") ?? versions.find((v) => v.type === t))
      ?.payload as Record<string, unknown> | undefined;
  const snapshot: ListingSnapshot = {
    title: (latest("title")?.text as string) ?? "",
    bullets: (latest("bullets")?.items as string[]) ?? [],
    description: (latest("description")?.text as string) ?? "",
    backendKeywords: (latest("backend_keywords")?.text as string) ?? "",
  };

  const kws = (await db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) })).filter((k) => !k.ausgeschlossen);
  const primaryKeywords = kws.filter((k) => k.tier === "primary").map((k) => k.keyword);
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, id),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, product.brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const sovUpload = uploads.find(
    (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === id,
  );
  const sovAudit = (sovUpload?.parsed as { audit?: SovAudit })?.audit ?? null;

  const analysis = analyzeListing({
    snapshot,
    facts: product.facts,
    primaryKeywords,
    sovAudit,
    reviewInsights: insights?.payload ?? null,
  });

  // Marken-Name des Auftrags: bei Optimizer-Aufträgen steckt er im Produktnamen ("Marke — Produkt")
  const isWorkbench = brand?.kind === "workbench";
  const brandName = isWorkbench ? (product.name.includes(" — ") ? product.name.split(" — ")[0] : "—") : brand?.name ?? "";
  const displayName = isWorkbench && product.name.includes(" — ") ? product.name.split(" — ").slice(1).join(" — ") : product.name;

  const briefInputs = {
    brand: brandName,
    productName: displayName,
    asin: product.asin,
    facts: product.facts,
    primaryKeywords,
    reviewInsights: insights?.payload ?? null,
  };

  const briefs = [
    {
      key: "bilder",
      titel: "Listing-Bilder-Brief (7 Slots)",
      hinweis: "Deterministisch aus Analyse + Produkt-Wahrheit — inkl. Reference-Fidelity-Lock und spelling-safe Headlines.",
      text: buildImageBrief({ brand: brandName, productName: displayName, asin: product.asin, facts: product.facts, snapshot, analysis, reviewInsights: insights?.payload ?? null }),
    },
    {
      key: "aplus",
      titel: "A+ Content Brief",
      hinweis: "Modul-Plan mit Amazon-Specs, Inhalt je Modul aus USPs/Pain Points/Kaufauslösern, Alt-Text-Keywords.",
      text: buildAplusBrief(briefInputs),
    },
    {
      key: "store",
      titel: "Brand-Store-Konzept",
      hinweis: "Seitenstruktur, Kachel-Plan, Specs und Guidelines — Grundlage fürs Designer-Briefing.",
      text: buildStoreConcept(briefInputs),
    },
  ];

  return (
    <main className="w-full p-8 print:p-0">
      <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline print:hidden">← Werkbank</Link>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="page-title">Creative-Briefs</h1>
        <span className="text-sm text-muted">{product.name}{product.asin ? ` · ${product.asin}` : ""}</span>
      </div>
      <p className="page-sub">
        Finale Konzepte für Designer & Bildgen-Tools — das Tool erstellt keine Bilder, es liefert die Grundlage:
        Richtlinien, Spezifikationen, Brand- und Produktinformationen. Je vollständiger Produkt-Wahrheit, Keywords und
        Review-Insights, desto konkreter die Briefs.
      </p>

      <div className="stagger mt-6 space-y-4">
        {briefs.map((b) => (
          <section key={b.key} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{b.titel}</h2>
              <span className="text-xs text-muted">{b.hinweis}</span>
            </div>
            <pre className="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-background p-4 text-xs leading-relaxed print:max-h-none">{b.text}</pre>
          </section>
        ))}
      </div>
    </main>
  );
}
