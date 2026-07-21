import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createProduct } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

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

      <form action={createProduct} className="mt-5 flex flex-wrap gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input name="name" placeholder="Produktname" required className={`${input} min-w-48 flex-1`} />
        <input name="asin" placeholder="ASIN (B0…)" className={`${input} w-40 font-mono`} />
        {/* Marktplatz beim Anlegen (D128): Import & Scrapes laufen gegen diese Domain — die ASIN allein verrät ihn nicht */}
        <select name="marketplace" defaultValue="de" className={`${input} w-36`} title="Marktplatz — Listing-Import und Review-Scrapes laufen gegen diese Amazon-Domain">
          <option value="de">amazon.de</option>
          <option value="uk">amazon.co.uk</option>
          <option value="us">amazon.com</option>
          <option value="fr">amazon.fr</option>
          <option value="it">amazon.it</option>
          <option value="es">amazon.es</option>
          <option value="nl">amazon.nl</option>
        </select>
        <SubmitButton className="btn-primary">
          + Produkt
        </SubmitButton>
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
