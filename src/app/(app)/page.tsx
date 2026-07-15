import Link from "next/link";
import { getDb } from "@/db/client";
import { createClient } from "@/app/actions";
import { OsShell } from "@/components/shell";
import { IconKatalog, IconHandlungen, IconUsers, IconArrowRight } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/** Agentur-Ebene: Portfolio aller Kunden/Marken — der Einstieg ins OS. */
export default async function Portfolio() {
  const db = await getDb();
  const clients = await db.query.clients.findMany();
  const brands = (await db.query.brands.findMany()).filter((b) => b.kind !== "workbench");
  const allProducts = await db.query.products.findMany();
  const brandIds = new Set(brands.map((b) => b.id));
  const products = allProducts.filter((p) => brandIds.has(p.brandId));
  const openActions = await db.query.actions.findMany();
  const open = openActions.filter((a) => a.status !== "done");

  return (
    <OsShell>
      <main className="w-full p-8">
        <h1 className="page-title">Portfolio</h1>
        <p className="page-sub">Alle Kunden & Marken der Agentur — der Einstieg in jeden Marken-Workspace.</p>

        <div className="stagger mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Marken", value: brands.length, icon: <IconUsers />, chip: "chip-violet" },
            { label: "Produkte (ASINs)", value: products.length, icon: <IconKatalog />, chip: "chip-teal" },
            { label: "Offene Handlungen", value: open.length, icon: <IconHandlungen />, chip: "chip-amber" },
          ].map((t) => (
            <div key={t.label} className="card flex items-center gap-3 p-4">
              <span className={`icon-chip ${t.chip}`}>{t.icon}</span>
              <div>
                <div className="stat-value">{t.value}</div>
                <div className="stat-label">{t.label}</div>
              </div>
            </div>
          ))}
        </div>

        <form action={createClient} className="mt-8 flex max-w-lg gap-2">
          <input
            name="name"
            placeholder="Neuen Kunden anlegen (Marke wird mit angelegt)"
            className="input-base flex-1"
            required
          />
          <SubmitButton className="btn-primary">Anlegen</SubmitButton>
        </form>

        <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {clients.length === 0 && (
            <p className="card border-dashed p-6 text-sm text-muted">Noch keine Kunden. Lege den ersten an — danach öffnet sich der Marken-Workspace.</p>
          )}
          {clients.map((c) => {
            const clientBrands = brands.filter((b) => b.clientId === c.id);
            return clientBrands.map((b) => {
              const prods = products.filter((p) => p.brandId === b.id);
              const openCount = open.filter((a) => a.brandId === b.id).length;
              return (
                <Link key={b.id} href={`/marke/${b.id}`} className="card group p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-block h-9 w-9 flex-none rounded-xl bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] shadow-[0_4px_12px_rgb(124_92_252/0.3)]" />
                      <div>
                        <div className="font-semibold">{b.name}</div>
                        <div className="text-xs text-muted">Kunde: {c.name}</div>
                      </div>
                    </div>
                    {openCount > 0 && <span className="pill pill-warn">{openCount} offen</span>}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-muted">{prods.length} Produkte</span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary-strong transition group-hover:gap-2">
                      Workspace öffnen <IconArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            });
          })}
        </div>
      </main>
    </OsShell>
  );
}
