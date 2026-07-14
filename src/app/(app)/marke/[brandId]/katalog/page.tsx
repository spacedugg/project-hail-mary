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
  const input = "input-base";

  return (
    <main className="w-full p-8">
      <h1 className="page-title">Katalog</h1>
      <p className="page-sub">Produkte dieser Marke. Die meisten ASINs existieren schon — anlegen, dann Daten anbinden.</p>

      <form action={createProduct} className="mt-5 flex gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input name="name" placeholder="Produktname" required className={`${input} flex-1`} />
        <input name="asin" placeholder="ASIN (B0…)" className={`${input} w-40 font-mono`} />
        <button className="btn-primary">
          + Produkt
        </button>
      </form>

      <ul className="mt-6 card divide-y divide-hair overflow-hidden">
        {products.length === 0 && <li className="p-4 text-sm text-neutral-400">Noch keine Produkte.</li>}
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/produkte/${p.id}`} className="flex items-center justify-between p-4 hover:bg-background">
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                {p.asin && <div className="font-mono text-xs text-neutral-500">{p.asin} · amazon.{p.marketplace}</div>}
              </div>
              <span className="text-xs text-primary-strong">öffnen →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
