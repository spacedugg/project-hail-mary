import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createProduct } from "@/app/actions";

export const dynamic = "force-dynamic";

/** Katalog dieser Marke — Einstieg in die Produkt-Details. */
export default async function BrandKatalog({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const input = "rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Katalog</h1>
      <p className="mt-1 text-sm text-neutral-500">Produkte dieser Marke. Die meisten ASINs existieren schon — anlegen, dann Daten anbinden.</p>

      <form action={createProduct} className="mt-5 flex gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input name="name" placeholder="Produktname" required className={`${input} flex-1`} />
        <input name="asin" placeholder="ASIN (B0…)" className={`${input} w-40 font-mono`} />
        <button className="rounded bg-teal-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
          + Produkt
        </button>
      </form>

      <ul className="mt-6 divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-900 dark:border-neutral-800">
        {products.length === 0 && <li className="p-4 text-sm text-neutral-400">Noch keine Produkte.</li>}
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/produkte/${p.id}`} className="flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900">
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                {p.asin && <div className="font-mono text-xs text-neutral-500">{p.asin} · amazon.{p.marketplace}</div>}
              </div>
              <span className="text-xs text-teal-700 dark:text-teal-400">öffnen →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
