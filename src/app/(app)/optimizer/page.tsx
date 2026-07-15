import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createOptimizerOrder } from "@/app/actions";
import { OsShell } from "@/components/shell";
import { IconContent, IconArrowRight, IconSparkle } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Listing Optimizer (D68) — Einzelaufträge ohne Markenbetreuung:
 * Texte, SEO/SOV, Bild-/A+-/Store-Briefs für Produkte, die zu keiner
 * betreuten Marke gehören. Volle Produkt-Werkbank, null Marken-Overhead.
 */
export default async function OptimizerPage() {
  const db = await getDb();
  const workbench = await db.query.brands.findFirst({ where: eq(schema.brands.kind, "workbench") });
  const orders = workbench
    ? await db.query.products.findMany({ where: eq(schema.products.brandId, workbench.id) })
    : [];
  const input = "input-base";

  return (
    <OsShell>
      <main className="w-full p-8">
        <div className="flex items-center gap-3">
          <span className="icon-chip chip-dark"><IconSparkle /></span>
          <div>
            <h1 className="page-title">Listing Optimizer</h1>
            <p className="page-sub">
              Einzelaufträge ohne Markenbetreuung: komplette Listing-Werkbank (Import, Keywords, SOV, Reviews, Texte, Marge)
              plus Creative-Briefs für Bilder, A+ und Brand Store — als finale Konzepte für Designer/Bildgen, nicht als Bilderstellung im Tool.
            </p>
          </div>
        </div>

        <section className="mt-6 card p-4">
          <h2 className="sect-h">Neuen Auftrag anlegen</h2>
          <form action={createOptimizerOrder} className="mt-3 flex flex-wrap gap-2">
            <input name="brandName" placeholder="Marke/Hersteller (optional)" className={`${input} w-56`} />
            <input name="name" placeholder="Produkt/Auftrag *" required className={`${input} min-w-64 flex-1`} />
            <input name="asin" placeholder="ASIN (B0…, optional)" className={`${input} w-44 font-mono`} />
            <button className="btn-primary">Auftrag anlegen</button>
          </form>
          <p className="mt-2 text-xs text-muted">Bestehende ASIN? Nach dem Anlegen direkt „Von Amazon importieren" — Neuprodukt: Produkt-Wahrheit von Hand füllen.</p>
        </section>

        <section className="mt-6">
          <h2 className="sect-h">Aufträge · {orders.length}</h2>
          <div className="stagger mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {orders.length === 0 && (
              <p className="card border-dashed p-6 text-sm text-muted">Noch keine Einzelaufträge.</p>
            )}
            {orders.map((p) => (
              <Link key={p.id} href={`/produkte/${p.id}`} className="card group p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="icon-chip chip-violet"><IconContent /></span>
                  {p.asin && <span className="tag">{p.asin}</span>}
                </div>
                <div className="mt-3 text-sm font-semibold">{p.name}</div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted">amazon.{p.marketplace}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary-strong transition group-hover:gap-2">
                    Werkbank öffnen <IconArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </OsShell>
  );
}
