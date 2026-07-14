import { eq, desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { uploadFlatfileTemplate } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * Flat Files (D46): neuste Amazon-Kategorievorlage hochladen → Tool füllt sie
 * mit dem generierten Content → Download als upload-fertige TXT für Seller
 * Central. API-Push folgt (D27).
 */
export default async function FlatfilesPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const templates = await db.query.flatfileTemplates.findMany({
    where: eq(schema.flatfileTemplates.brandId, brandId),
    orderBy: desc(schema.flatfileTemplates.createdAt),
  });
  const latestTpl = templates[0];

  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = products.map((p) => p.id);
  const versions = pids.length
    ? await db.query.contentVersions.findMany({ where: inArray(schema.contentVersions.productId, pids) })
    : [];
  const hasTitle = (pid: string) => versions.some((v) => v.productId === pid && v.type === "title");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Flat Files</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Amazon-Vorlagen ändern sich laufend — hier immer die <b>neuste Kategorievorlage</b> hochladen (aus Seller Central: „Vorlage generieren", .xlsx/.xlsm/.txt).
        Das Tool füllt sie mit dem generierten Content; Download als upload-fertige TXT. Direkter API-Push folgt.
      </p>

      <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          1 · Vorlage {latestTpl && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">✓ {latestTpl.fileName}</span>}
        </h2>
        <form action={uploadFlatfileTemplate} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="file" name="file" accept=".xlsx,.xlsm,.txt,.tsv" required className="text-sm" />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-black">
            Neuste Vorlage hochladen
          </button>
        </form>
        {latestTpl && (
          <p className="mt-2 text-xs text-neutral-500">
            {latestTpl.fieldNames.filter(Boolean).length} Felder erkannt{latestTpl.sheetName ? ` (Sheet „${latestTpl.sheetName}")` : ""} · hochgeladen {latestTpl.createdAt.toLocaleDateString("de-DE")}
            {templates.length > 1 && ` · ${templates.length - 1} ältere Version(en) archiviert`}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">2 · Produkte im Flat File</h2>
        <ul className="mt-2 space-y-1">
          {products.length === 0 && <li className="text-sm text-neutral-400">Keine Produkte im Katalog.</li>}
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className={hasTitle(p.id) ? "text-emerald-600" : "text-amber-500"}>{hasTitle(p.id) ? "✓" : "△"}</span>
              {p.name} {p.asin && <span className="font-mono text-xs text-neutral-500">{p.asin}</span>}
              {!hasTitle(p.id) && <span className="text-xs text-neutral-400">— noch kein Content generiert (Zeile bleibt leer)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        {latestTpl && products.length > 0 ? (
          <a
            href={`/api/flatfile/${brandId}`}
            className="inline-block rounded bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
            download
          >
            ⇣ Flat File herunterladen (TXT für Seller Central)
          </a>
        ) : (
          <p className="text-sm text-neutral-400">Zum Download: Vorlage hochladen{products.length === 0 ? " und Produkte anlegen" : ""}.</p>
        )}
      </section>
    </main>
  );
}
