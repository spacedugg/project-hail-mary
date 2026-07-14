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
    <main className="w-full p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Handlungen</h1>
          <p className="page-sub">
            Priorisiert nach €-Hebel. Handlungen entstehen in den Analysen — dieser Reiter ist die Sammelsicht der Marke.
          </p>
        </div>
        <form action={syncBrandActions}>
          <input type="hidden" name="brandId" value={brandId} />
          <button className="btn-primary">
            Aus Analysen ableiten
          </button>
        </form>
      </div>

      {all.length === 0 && (
        <p className="mt-8 card border-dashed p-6 text-sm text-muted">
          Noch keine Handlungen. Erst Content generieren / SOV-Report hochladen (im <Link href={`/marke/${brandId}/katalog`} className="text-primary-strong underline">Katalog</Link>),
          dann oben „Aus Analysen ableiten" klicken.
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {open.map((a) => (
          <li key={a.id} className="card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="tag uppercase">{CAT_LABEL[a.category] ?? a.category}</span>
                  <span className="tag">{a.scope === "product" ? "Produkt" : "Marke"}</span>
                  <span className="text-neutral-400">← {a.source}</span>
                  {a.upliftEur ? <span className="pill pill-good">~{fmt(a.upliftEur)} €/Mo</span> : null}
                  {a.status === "in_progress" && <span className="pill pill-neutral">in Arbeit</span>}
                </div>
                <p className="mt-1 text-sm">
                  {a.title}
                  {a.productId && (
                    <Link href={`/produkte/${a.productId}/analyse`} className="ml-1 text-xs text-primary-strong hover:underline">
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
                    <button className="btn-ghost px-2 py-1 text-xs">Start</button>
                  </form>
                )}
                <form action={setActionStatus}>
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="brandId" value={brandId} />
                  <input type="hidden" name="status" value="done" />
                  <button className="btn-ghost px-2 py-1 text-xs !text-good">✓ Erledigt</button>
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
