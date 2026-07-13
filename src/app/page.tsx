import Link from "next/link";
import { getDb, schema } from "@/db/client";
import { createClient, createProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const clients = await db.query.clients.findMany();
  const brands = await db.query.brands.findMany();
  const products = await db.query.products.findMany();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Katalog</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Kunde → Marke → Produkt (ASIN). Das Rückgrat — alles Weitere hängt am Produkt.
      </p>

      <form action={createClient} className="mt-6 flex gap-2">
        <input
          name="name"
          placeholder="Neuen Kunden anlegen (Name)"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          required
        />
        <button className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
          Anlegen
        </button>
      </form>

      <div className="mt-8 space-y-6">
        {clients.length === 0 && (
          <p className="text-sm text-neutral-400">Noch keine Kunden. Lege den ersten an.</p>
        )}
        {clients.map((c) => {
          const clientBrands = brands.filter((b) => b.clientId === c.id);
          return (
            <section key={c.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <h2 className="font-medium">{c.name}</h2>
              {clientBrands.map((b) => {
                const brandProducts = products.filter((p) => p.brandId === b.id);
                return (
                  <div key={b.id} className="mt-3">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Marke: {b.name}</div>
                    <ul className="mt-2 space-y-1">
                      {brandProducts.map((p) => (
                        <li key={p.id}>
                          <Link href={`/produkte/${p.id}`} className="text-sm text-teal-700 hover:underline dark:text-teal-400">
                            {p.name} {p.asin ? <span className="font-mono text-xs text-neutral-500">({p.asin})</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <form action={createProduct} className="mt-2 flex gap-2">
                      <input type="hidden" name="brandId" value={b.id} />
                      <input name="name" placeholder="Produktname" required className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                      <input name="asin" placeholder="ASIN (optional)" className="w-36 rounded border border-neutral-300 px-2 py-1 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                      <button className="rounded border border-teal-700 px-3 py-1 text-sm text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950">
                        + Produkt
                      </button>
                    </form>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
