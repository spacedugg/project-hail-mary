import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createOptimizerOrder, deleteProductAction } from "@/app/actions";
import { LoeschButton } from "@/components/loesch-button";
import { OsShell } from "@/components/shell";
import { IconContent, IconArrowRight, IconSparkle } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { FamilieGruppieren } from "@/components/familie-gruppieren";
import { ladeGruppierbar } from "@/lib/variants/laden";

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

  // Variations-Familien (D221): dieselbe Logik wie im Marken-Katalog, nur als Karten.
  const gruppierbar = workbench ? await ladeGruppierbar(db, workbench.id) : [];
  const parentIds = new Set(orders.filter((p) => p.variantRole === "parent").map((p) => p.id));
  const kinderVon = (pid: string) => orders.filter((p) => p.variantRole === "child" && p.parentProductId === pid);
  const eingehaengt = (p: (typeof orders)[number]) => p.variantRole === "child" && !!p.parentProductId && parentIds.has(p.parentProductId);
  const familien = orders.filter((p) => p.variantRole === "parent");
  // Einzeln = Standalone + evtl. Waisen-Childs (Parent fehlt) — nie unsichtbar.
  const einzeln = orders.filter((p) => p.variantRole !== "parent" && !eingehaengt(p));

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
            <input name="brandName" placeholder="Marke *" required className={`${input} w-48`} />
            <input name="name" placeholder="Produkt/Auftrag *" required className={`${input} min-w-64 flex-1`} />
            <input name="asin" placeholder="ASIN (B0…) *" required pattern="[Bb][A-Za-z0-9]{9}" className={`${input} w-44 font-mono`} />
            <select name="marketplace" defaultValue="de" className={`${input} w-36`}>
              <option value="de">amazon.de</option>
              <option value="uk">amazon.co.uk</option>
              <option value="us">amazon.com</option>
              <option value="fr">amazon.fr</option>
              <option value="it">amazon.it</option>
              <option value="es">amazon.es</option>
              <option value="nl">amazon.nl</option>
            </select>
            <select name="contentSprache" defaultValue="de" className={`${input} w-36`}>
              <option value="de">Content: Deutsch</option>
              <option value="en">Content: Englisch</option>
              <option value="fr">Content: Französisch</option>
              <option value="it">Content: Italienisch</option>
              <option value="es">Content: Spanisch</option>
            </select>
            <SubmitButton className="btn-primary">Auftrag anlegen</SubmitButton>
          </form>
        </section>

        {workbench && gruppierbar.length > 0 && (
          <details className="mt-4 rounded-xl border border-hair p-3.5">
            <summary className="cursor-pointer text-sm font-semibold">Variations-Familie (Parent-Child) anlegen</summary>
            <p className="mt-2 text-xs text-muted">
              Ähnliche Aufträge (Geschmack, Größe, Farbe …) zu einer Familie zusammenfassen — Content wird für eine Variante
              freigegeben und stilgleich auf die anderen übertragen. Familien erscheinen unten als aufklappbare Gruppe.
            </p>
            <div className="mt-3">
              <FamilieGruppieren brandId={workbench.id} produkte={gruppierbar} />
            </div>
          </details>
        )}

        <section className="mt-6">
          <h2 className="sect-h">Aufträge · {orders.length}</h2>
          {familien.length > 0 && (
            <div className="mt-2 grid gap-3">
              {familien.map((parent) => {
                const kinder = kinderVon(parent.id);
                const anzahl = kinder.length + (parent.variantParentContainer ? 0 : 1);
                const varianten = parent.variantParentContainer ? kinder : [parent, ...kinder];
                return (
                  <details key={parent.id} open className="card p-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="font-semibold">{parent.name}</span>
                      <span className="text-xs text-muted">
                        Familie · {anzahl} Varianten · {parent.variantParentContainer ? "Container (nicht kaufbar)" : parent.asin}
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-1.5">
                      <Link href={`/produkte/${parent.id}`} className="w-fit text-xs font-medium text-primary-strong underline">
                        Familie verwalten →
                      </Link>
                      {varianten.map((k) => (
                        <Link
                          key={k.id}
                          href={`/produkte/${k.id}`}
                          className="flex items-center gap-2 rounded-lg border border-hair px-3 py-1.5 text-sm hover:bg-[var(--primary-soft)]"
                        >
                          <span className="font-mono text-[13px]">{k.asin ?? "—"}</span>
                          <span className="truncate text-muted">{k.name}</span>
                          {k.id === parent.id && <span className="pill pill-neutral">Parent</span>}
                        </Link>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          <div className="stagger mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {orders.length === 0 && (
              <p className="card border-dashed p-6 text-sm text-muted">Noch keine Einzelaufträge.</p>
            )}
            {einzeln.map((p) => (
              <div key={p.id} className="card group relative p-4">
                {/* Mülleimer in der Kachel (D162): Klick → Rückfrage → weg */}
                <LoeschButton
                  action={deleteProductAction}
                  felder={{ productId: p.id }}
                  frage={`„${p.name}" mit allen Daten endgültig löschen?`}
                  title="Auftrag löschen"
                  className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-neutral-300 transition hover:bg-[rgb(220_38_38/0.08)] hover:text-bad"
                />
                <Link href={`/produkte/${p.id}`} className="block">
                <div className="flex items-start justify-between gap-2 pr-8">
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
              </div>
            ))}
          </div>
        </section>
      </main>
    </OsShell>
  );
}
