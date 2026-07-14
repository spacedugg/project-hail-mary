import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { syncBrandActions, setActionStatus } from "@/app/actions";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = {
  content: "Content", ppc: "PPC", listing: "Listing", produkt: "Produkt", daten: "Daten",
};

/**
 * Handlungen — eine SICHT auf die actions-Tabelle (D45), erzeugt selbst nichts.
 * Quelle jeder Handlung ist die Analyse, aus der sie stammt (Begründungs-Prinzip).
 */
export default async function BrandHandlungen({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const all = await db.query.actions.findMany({
    where: eq(schema.actions.brandId, brandId),
    orderBy: desc(schema.actions.createdAt),
  });
  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name;

  const open = all.filter((a) => a.status !== "done").sort((a, b) => (b.upliftEur ?? 0) - (a.upliftEur ?? 0));
  const done = all.filter((a) => a.status === "done");
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Handlungen</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Priorisiert nach €-Hebel. Handlungen entstehen in den Analysen — dieser Reiter ist die Sammelsicht der Marke.
          </p>
        </div>
        <form action={syncBrandActions}>
          <input type="hidden" name="brandId" value={brandId} />
          <button className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
            Aus Analysen ableiten
          </button>
        </form>
      </div>

      {all.length === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Noch keine Handlungen. Erst Content generieren / SOV-Report hochladen (im <Link href={`/marke/${brandId}/katalog`} className="text-teal-700 underline">Katalog</Link>),
          dann oben „Aus Analysen ableiten" klicken.
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {open.map((a) => (
          <li key={a.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono uppercase text-neutral-500 dark:bg-neutral-800">{CAT_LABEL[a.category] ?? a.category}</span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-500 dark:bg-neutral-800">{a.scope === "product" ? "Produkt" : "Marke"}</span>
                  <span className="text-neutral-400">← {a.source}</span>
                  {a.upliftEur ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">~{fmt(a.upliftEur)} €/Mo</span> : null}
                  {a.status === "in_progress" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">in Arbeit</span>}
                </div>
                <p className="mt-1 text-sm">
                  {a.title}
                  {a.productId && (
                    <Link href={`/produkte/${a.productId}/analyse`} className="ml-1 text-xs text-teal-700 hover:underline dark:text-teal-400">
                      → Analyse
                    </Link>
                  )}
                </p>
              </div>
              <div className="flex flex-none gap-1">
                {a.status !== "in_progress" && (
                  <form action={setActionStatus}>
                    <input type="hidden" name="actionId" value={a.id} />
                    <input type="hidden" name="brandId" value={brandId} />
                    <input type="hidden" name="status" value="in_progress" />
                    <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">Start</button>
                  </form>
                )}
                <form action={setActionStatus}>
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="brandId" value={brandId} />
                  <input type="hidden" name="status" value="done" />
                  <button className="rounded border border-emerald-600 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">✓ Erledigt</button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-neutral-500">Erledigt ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((a) => (
              <li key={a.id} className="text-xs text-neutral-400 line-through">{a.title}</li>
            ))}
          </ul>
        </details>
      )}
      {products.length === 0 && null}
    </main>
  );
}
