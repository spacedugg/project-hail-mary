import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { erzeugeBildBriefingAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { MarkdownBlock } from "@/components/markdown-block";
import { BildBriefingAnsicht } from "@/components/bild-briefing-ansicht";
import { ladeBildBriefing } from "@/lib/analysis/briefingErzeugung";
import { buildAplusBrief, buildStoreConcept } from "@/lib/analysis/creativeBriefs";
import { WerkAuswahl } from "@/components/werk-auswahl";
import { istWerkGewaehlt, WERK_LABEL } from "@/lib/content/werke";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Briefings (D68, umgebaut in D269).
 *
 * Vorher: vier Markdown-Strings in `<pre>`-Blöcken — Sternchen, Bindestriche,
 * Raute-Überschriften, unlesbar. Jetzt:
 *  - das Bilder-Briefing als STRUKTURIERTE Ansicht mit Sprach-Schalter
 *    (Deutsch als Standard, Englisch sinngemäß lokalisiert)
 *  - A+ und Brand-Store weiterhin als Text-Briefs, aber gerendert statt roh
 *
 * Der Sprach-Schalter steht bewusst nur am Bilder-Briefing: Es ist das, was ein
 * externer Designer bekommt. A+ und Store gehen ans eigene Team.
 */
export default async function BriefsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sprache?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { sprache: spracheRoh, fehler } = await searchParams;
  const sprache = spracheRoh === "en" ? "en" : "de";

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });

  const [insights, briefing, driverLauf, kwsAlle] = await Promise.all([
    db.query.reviewInsights.findFirst({
      where: eq(schema.reviewInsights.productId, id),
      orderBy: desc(schema.reviewInsights.createdAt),
    }),
    ladeBildBriefing(id, sprache),
    db.query.conversionDrivers.findFirst({
      where: eq(schema.conversionDrivers.productId, id),
      orderBy: desc(schema.conversionDrivers.createdAt),
    }),
    db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) }),
  ]);

  const kws = kwsAlle.filter((k) => !k.ausgeschlossen);
  const istWerkbank = brand?.kind === "workbench";
  const markenName = product.marke ?? (istWerkbank && product.name.includes(" — ") ? product.name.split(" — ")[0] : brand?.name ?? "");
  const produktName = istWerkbank && product.name.includes(" — ") ? product.name.split(" — ").slice(1).join(" — ") : product.name;

  const briefInputs = {
    brand: markenName,
    productName: produktName,
    asin: product.asin,
    facts: product.facts,
    primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
    reviewInsights: insights?.payload ?? null,
  };

  // Werk-Auswahl (D270, Nutzer-Vorgabe 31.07.): Vorher wurden A+ Basic, A+ Premium
  // UND Store bei JEDEM Aufruf dieser Seite gebaut — ungefragt, auch ohne
  // Premium-Zugang. Jetzt entsteht nur, was beauftragt ist. Die Briefs sind
  // deterministisch assembliert; sie hier zu bauen IST ihre Erzeugung.
  const bildBriefingGewaehlt = istWerkGewaehlt(product.werkePlan, "bilder-briefing");
  const textBriefs = [
    istWerkGewaehlt(product.werkePlan, "aplus-basic") && {
      key: "aplus-basic",
      titel: "A+ Content Brief — Basic",
      hinweis: "Design-Guide-Specs (1940×1200, 6 Module, weißer Trenner).",
      text: buildAplusBrief(briefInputs, "basic"),
    },
    istWerkGewaehlt(product.werkePlan, "aplus-premium") && {
      key: "aplus-premium",
      titel: "A+ Content Brief — Premium",
      hinweis: "Full Image 2196×900, nahtlos, Karussells/Hotspots — nur bei Premium-Zugang.",
      text: buildAplusBrief(briefInputs, "premium"),
    },
    istWerkGewaehlt(product.werkePlan, "brand-store") && {
      key: "store",
      titel: "Brand-Store-Konzept",
      hinweis: "Seitenstruktur, Kachel-Plan, Specs und Guidelines.",
      text: buildStoreConcept(briefInputs),
    },
  ].filter((b): b is { key: string; titel: string; hinweis: string; text: string } => Boolean(b));

  const veraltet = briefing && driverLauf ? briefing.createdAt < driverLauf.createdAt : false;

  return (
    <main className="w-full p-8 print:p-0">
      <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline print:hidden">← Werkbank</Link>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="page-title">Briefings</h1>
        <span className="text-sm text-muted">{product.name}{product.asin ? ` · ${product.asin}` : ""}</span>
      </div>
      <p className="page-sub">Grundlage für Designer und Bildgen — was rüberkommen soll, nicht wie es gestaltet wird.</p>

      {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.1)] px-3 py-2 text-sm text-bad print:hidden">{fehler}</p>}

      {/* Auftragsumfang (D270): hier wird entschieden, welche Briefings dieses
          Produkt überhaupt bekommt — direkt an der Stelle, wo sie entstehen.
          Beim Drucken raus: das Briefing selbst ist das Dokument, nicht die Auswahl. */}
      <div className="print:hidden">
        <WerkAuswahl
          productId={product.id}
          werkePlan={product.werkePlan}
          contentPlan={product.contentPlan}
          ueberschrift="Was soll für dieses Produkt erstellt werden?"
        />
      </div>

      {/* ── Bilder-Briefing ──────────────────────────────────────────────── */}
      {bildBriefingGewaehlt && (
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h2 className="text-base font-semibold">Bilder-Briefing</h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Sprach-Schalter: Deutsch ist Standard, Englisch für externe Designer */}
            <div className="flex overflow-hidden rounded-full border border-hair text-xs">
              {(["de", "en"] as const).map((s) => (
                <Link
                  key={s}
                  href={`/produkte/${id}/briefs?sprache=${s}`}
                  className={`px-3 py-1.5 ${sprache === s ? "bg-primary text-white" : "hover:bg-background"}`}
                  aria-current={sprache === s ? "true" : undefined}
                >
                  {s === "de" ? "Deutsch" : "English"}
                </Link>
              ))}
            </div>
            <form action={erzeugeBildBriefingAction}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="sprache" value={sprache} />
              <SubmitButton
                className={briefing ? "btn-dark text-xs" : "btn-primary text-xs"}
                pendingLabel={sprache === "en" ? "Lokalisiert…" : "Baut Briefing…"}
                progress
              >
                {briefing
                  ? sprache === "en" ? "Neu lokalisieren" : "Neu erzeugen"
                  : sprache === "en" ? "Englische Fassung erzeugen" : "Briefing erzeugen"}
              </SubmitButton>
            </form>
          </div>
        </div>

        {veraltet && (
          <p className="mt-2 text-xs text-warn print:hidden">
            △ Die Analyse ist neuer als dieses Briefing — neu erzeugen, damit die Kaufgründe aktuell sind.
          </p>
        )}

        <div className="mt-3">
          {briefing ? (
            <BildBriefingAnsicht p={briefing.payload} hinweise={briefing.hinweise} />
          ) : (
            <div className="card p-5 text-sm text-muted">
              {driverLauf
                ? sprache === "en"
                  ? "Für dieses Produkt gibt es noch keine englische Fassung — oben erzeugen. Sie entsteht aus der deutschen Fassung, damit beide dasselbe Briefing sind."
                  : "Noch kein Bilder-Briefing erzeugt — oben starten."
                : "Das Bilder-Briefing braucht den Conversion-Driver-Lauf: Es briefet genau die Kaufgründe, die im Bildset nicht bewiesen sind."}
            </div>
          )}
        </div>
      </section>
      )}

      {/* ── Text-Briefs (eigenes Team) ───────────────────────────────────── */}
      {textBriefs.length > 0 && (
      <section className="mt-8">
        <h2 className="text-base font-semibold">A+ &amp; Brand Store</h2>
        <p className="mt-0.5 text-xs text-muted">Für das eigene Team — deshalb ohne Sprach-Schalter.</p>
        <div className="stagger mt-3 space-y-4">
          {textBriefs.map((b) => (
            <details key={b.key} className="card p-4">
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{b.titel}</span>
                <span className="text-xs text-muted">{b.hinweis}</span>
              </summary>
              <div className="mt-3 border-t border-hair pt-3">
                <MarkdownBlock text={b.text} />
              </div>
            </details>
          ))}
        </div>
      </section>
      )}

      {/* Ehrlicher Leerzustand (D270): Nichts gewählt heißt nichts erzeugt — und
          das wird gesagt, statt die Seite leer zu lassen. */}
      {!bildBriefingGewaehlt && textBriefs.length === 0 && (
        <p className="card mt-6 p-5 text-sm text-muted print:hidden">
          Für dieses Produkt ist kein Briefing beauftragt. Oben auswählen — {WERK_LABEL["bilder-briefing"]},{" "}
          {WERK_LABEL["aplus-basic"]}, {WERK_LABEL["aplus-premium"]} oder {WERK_LABEL["brand-store"]} — und speichern.
        </p>
      )}
    </main>
  );
}
