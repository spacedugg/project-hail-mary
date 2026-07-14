import Link from "next/link";
import { getDb, schema } from "@/db/client";
import { createClient } from "./actions";

export const dynamic = "force-dynamic";

/** Agentur-Ebene: Portfolio aller Kunden/Marken — der Einstieg ins OS. */
export default async function Portfolio() {
  const db = await getDb();
  const clients = await db.query.clients.findMany();
  const brands = await db.query.brands.findMany();
  const products = await db.query.products.findMany();
  const openActions = await db.query.actions.findMany();

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center gap-2">
        <span className="inline-block h-7 w-7 rounded-md bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4]" />
        <div>
          <h1 className="text-2xl font-semibold leading-tight">temoa OS</h1>
          <p className="text-xs text-neutral-500">Portfolio · alle Kunden & Marken</p>
        </div>
      </div>

      <form action={createClient} className="mt-6 flex max-w-lg gap-2">
        <input
          name="name"
          placeholder="Neuen Kunden anlegen (Marke wird mit angelegt)"
          className="input-base flex-1"
          required
        />
        <button className="btn-primary">
          Anlegen
        </button>
      </form>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {clients.length === 0 && (
          <p className="text-sm text-neutral-400">Noch keine Kunden. Lege den ersten an — danach öffnet sich der Marken-Workspace.</p>
        )}
        {clients.map((c) => {
          const clientBrands = brands.filter((b) => b.clientId === c.id);
          return clientBrands.map((b) => {
            const prods = products.filter((p) => p.brandId === b.id);
            const open = openActions.filter((a) => a.brandId === b.id && a.status !== "done").length;
            return (
              <Link
                key={b.id}
                href={`/marke/${b.id}`}
                className="card p-4 transition hover:border-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-neutral-500">Kunde: {c.name}</div>
                  </div>
                  {open > 0 && (
                    <span className="pill pill-warn">
                      {open} offen
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-neutral-500">
                  <span>{prods.length} Produkte</span>
                  <span className="text-primary-strong">Workspace öffnen →</span>
                </div>
              </Link>
            );
          });
        })}
      </div>
    </main>
  );
}
