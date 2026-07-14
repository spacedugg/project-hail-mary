import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { saveFacts, saveKeywords, generateContent, uploadCerebro, runReviewInsights, importListingFromAmazon, uploadListingCsv, saveContentManual } from "@/app/actions";
import type { ValidationIssue } from "@/db/schema";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { key: "title", label: "Titel" },
  { key: "bullets", label: "Bullet Points" },
  { key: "highlights", label: "Item Highlights" },
  { key: "backend", label: "Backend-Keywords" },
  { key: "description", label: "Beschreibung" },
  { key: "qa", label: "Q&A" },
] as const;

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length)
    return <p className="mt-1 text-xs text-emerald-600">✓ Gate bestanden — keine Befunde.</p>;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, n) => (
        <li key={n} className={`text-xs ${i.severity === "error" ? "text-red-600" : "text-amber-600"}`}>
          {i.severity === "error" ? "✕" : "△"} <span className="font-mono">{i.rule}</span> — {i.message}
        </li>
      ))}
    </ul>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();

  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) });
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, id),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, product.brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const sovUpload = uploads.find(
    (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === id,
  );
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, id),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, id),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  const latestOf = (t: string) => versions.find((v) => v.type === t);
  const f = product.facts;
  const input = "input-base";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/marke/${product.brandId}/katalog`} className="text-xs text-neutral-500 hover:underline">← Katalog</Link>
      <div className="mt-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {product.name}{" "}
          {product.asin && <span className="font-mono text-sm text-neutral-500">{product.asin} · amazon.{product.marketplace}</span>}
        </h1>
        <Link href={`/produkte/${product.id}/analyse`} className="btn-ghost !text-primary-strong font-medium">
          Analyse öffnen →
        </Link>
      </div>

      {/* 0 · Original-Listing (Import) */}
      <section className="mt-6 card p-4">
        <h2 className="sect-h">
          0 · Original-Listing (Import) {snapshot && <span className="ml-1 pill pill-good">✓ {snapshot.source} · {snapshot.createdAt.toLocaleDateString("de-DE")}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">Bestehende ASIN? Daten importieren statt tippen — als „Vorher" für Analyse & Vergleich.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={importListingFromAmazon}>
            <input type="hidden" name="productId" value={product.id} />
            <button disabled={!product.asin} className="btn-dark disabled:opacity-40">
              Von Amazon importieren (Apify)
            </button>
          </form>
          <form action={uploadListingCsv} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <input type="file" name="file" accept=".csv" required className="text-sm" />
            <button className="btn-ghost">H10-CSV importieren</button>
          </form>
        </div>
        {snapshot && (
          <div className="mt-3 rounded-xl bg-background p-3 text-xs">
            {snapshot.title && <p><b>Titel:</b> {snapshot.title}</p>}
            {snapshot.bullets && snapshot.bullets.length > 0 && (
              <ul className="mt-1 space-y-0.5">{snapshot.bullets.slice(0, 5).map((b, i) => <li key={i}>• {b.slice(0, 140)}{b.length > 140 ? "…" : ""}</li>)}</ul>
            )}
            <p className="mt-1 text-neutral-500">
              {snapshot.description ? `Beschreibung: ${snapshot.description.length} Zeichen` : "keine Beschreibung"} · {snapshot.imageUrls?.length ?? 0} Bilder
            </p>
          </div>
        )}
      </section>

      {/* 0b · Bildplätze */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">0b · Bildplätze (Listing)</h2>
        {snapshot?.imageUrls && snapshot.imageUrls.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => {
              const url = snapshot.imageUrls?.[i];
              return (
                <div key={i} className="card p-1 text-center">
                  {url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={url} alt={`Slot ${i + 1}`} className="mx-auto h-20 w-full rounded object-contain" />
                  ) : (
                    <div className="flex h-20 items-center justify-center text-lg text-neutral-300">＋</div>
                  )}
                  <div className="mt-1 text-[9px] uppercase tracking-wide text-neutral-500">{i === 0 ? "1 · Hauptbild" : `Slot ${i + 1}`}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-neutral-400">Noch keine Bilder — Original-Listing importieren (Sektion 0). A+-Bildplätze & Bild-Briefing folgen in der Bild-Phase; der Brief steht schon in der Analyse.</p>
        )}
      </section>

      {/* 1 · Produkt-Wahrheit */}
      <section className="mt-6 card p-4">
        <h2 className="sect-h">1 · Produkt-Wahrheit (Pflicht)</h2>
        <form action={saveFacts} className="mt-3 grid grid-cols-2 gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <input name="productType" defaultValue={f.productType} placeholder="Produkttyp (z. B. Trinkflasche)" className={input} />
          <input name="dimensions" defaultValue={f.dimensions} placeholder="Maße/Menge (z. B. 750 ml)" className={input} />
          <input name="materials" defaultValue={f.materials?.join(" | ")} placeholder="Materialien, ehrlich, | -getrennt" className={`${input} col-span-2`} />
          <input name="usps" defaultValue={f.usps?.join(" | ")} placeholder="USPs (| -getrennt) — jede wird genau 1× verwendet" className={`${input} col-span-2`} />
          <input name="targetAudience" defaultValue={f.targetAudience} placeholder="Zielgruppe" className={input} />
          <input name="certifications" defaultValue={f.certifications?.join(" | ")} placeholder="Zertifikate/Normen (nur echte)" className={input} />
          <button className="col-span-2 btn-dark">
            Speichern
          </button>
        </form>
      </section>

      {/* 2 · Keywords */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">
          2 · Keyword-Basis (Pflicht) — {kws.length} Keywords
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Eine Zeile je Keyword, optional „;Suchvolumen". v0-Tiering nach Reihenfolge: 1–3 primary → Titel, 4–13 secondary → Bullets, 14–18 tertiary → Beschreibung, Rest → Backend. (Cerebro-CSV-Import folgt.)
        </p>
        <form action={saveKeywords} className="mt-3">
          <input type="hidden" name="productId" value={product.id} />
          <textarea
            name="keywords"
            rows={6}
            defaultValue={kws.map((k) => `${k.keyword}${k.searchVolume ? `;${k.searchVolume}` : ""}`).join("\n")}
            placeholder={"edelstahl trinkflasche;18100\nthermosflasche;9900\n…"}
            className={`${input} font-mono`}
          />
          <button className="mt-2 btn-dark">
            Keywords speichern
          </button>
        </form>
      </section>

      {/* 2b · SOV-Report */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">
          2b · SOV-Report (Cerebro-CSV, optional) {sovUpload && <span className="ml-1 pill pill-good">✓ {sovUpload.fileName}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">Helium-10-Cerebro-Export (mit Wettbewerber-ASINs als Spalten) → SOV-Audit mit Quick-Wins & Umsatzlücken. Speist Analyse + Backend-Keywords.</p>
        <form action={uploadCerebro} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <input type="file" name="file" accept=".csv" required className="text-sm" />
          <input name="price" type="number" step="0.01" placeholder="Ø-Preis € (Default 45)" className={`${input} w-44`} />
          <button className="btn-dark">Hochladen & auswerten</button>
        </form>
        {uploads.find((u) => u.reportType === "cerebro" && u.parseStatus === "error") && !sovUpload && (
          <p className="mt-2 text-xs text-red-600">Letzter Upload fehlgeschlagen: {uploads.find((u) => u.parseStatus === "error")?.parseError}</p>
        )}
      </section>

      {/* 2c · Review-Insights */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">
          2c · Review-Insights (Apify) {insights && <span className="ml-1 pill pill-good">✓ {insights.dataBasis} · {insights.confidence}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">Scrapt Reviews der eigenen ASIN + bis 5 Wettbewerber (amazon.{product.marketplace}) → Pain Points & Kaufauslöser mit O-Tönen. Braucht APIFY_API_KEY (ohne: Mock).</p>
        <form action={runReviewInsights} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <input name="competitorAsins" placeholder="Wettbewerber-ASINs (Leerzeichen-getrennt)" className={`${input} flex-1`} />
          <button className="btn-dark">Reviews analysieren</button>
        </form>
        {insights && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-medium text-red-600">Pain Points</div>
              <ul className="mt-1 space-y-0.5">{insights.payload.painPoints.slice(0, 5).map((p, i) => <li key={i}>· {p.label}{p.frequencyPct ? ` (${p.frequencyPct} %)` : ""}</li>)}</ul>
            </div>
            <div>
              <div className="font-medium text-emerald-600">Kaufauslöser</div>
              <ul className="mt-1 space-y-0.5">{insights.payload.buyingTriggers.slice(0, 5).map((t, i) => <li key={i}>· {t.label}{t.frequencyPct ? ` (${t.frequencyPct} %)` : ""}</li>)}</ul>
            </div>
          </div>
        )}
      </section>

      {/* 3 · Content */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">3 · Content — generieren & Gate</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Sektionsweise (Titel → Bullets → Backend → Beschreibung); jede Generierung durchläuft das Validation-Gate. Ohne API-Key läuft der Mock-Modus.
        </p>
        <div className="mt-3 space-y-4">
          {SECTIONS.map(({ key, label }) => {
            const dbType = key === "backend" ? "backend_keywords" : key === "highlights" ? "item_highlights" : key;
            const v = latestOf(dbType);
            const payload = v?.payload as { text?: string; items?: string[]; pairs?: Array<{ q: string; a: string }>; rationale?: Array<{ part: string; source: string; verified: boolean }> } | undefined;
            return (
              <div key={key} className="card p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {label}{" "}
                    {v && <span className="ml-1 tag">v{v.version} · {v.status} · {v.generatedBy}</span>}
                  </h3>
                  <form action={generateContent}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="section" value={key} />
                    <button className="btn-primary px-3 py-1 text-xs">
                      {v ? "Neu generieren" : "Generieren"}
                    </button>
                  </form>
                </div>
                {payload?.text && (
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-background p-2 text-sm">
                    {payload.text}
                    {key === "title" && <span className="ml-2 font-mono text-[10px] text-neutral-400">{payload.text.length}/75</span>}
                    {key === "highlights" && <span className="ml-2 font-mono text-[10px] text-neutral-400">{payload.text.length}/125</span>}
                  </p>
                )}
                {payload?.pairs && (
                  <ul className="mt-2 space-y-1.5 rounded-xl bg-background p-2 text-sm">
                    {payload.pairs.map((p, i) => (
                      <li key={i}><b>F: {p.q}</b><br />A: {p.a}</li>
                    ))}
                  </ul>
                )}
                {payload?.rationale && payload.rationale.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">Begründung — warum so formuliert?</summary>
                    <ul className="mt-1 space-y-0.5">
                      {payload.rationale.map((r, i) => (
                        <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">
                          {r.verified ? "✓" : "⚠︎"} <b>„{r.part}"</b> ← {r.source}{!r.verified && " (im Text nicht belegt)"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {payload?.items && (
                  <ul className="mt-2 space-y-1 rounded-xl bg-background p-2 text-sm">
                    {payload.items.map((b, i) => <li key={i}>• {b}</li>)}
                  </ul>
                )}
                {v?.validation && <IssueList issues={v.validation.issues} />}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">
                    {v ? "Bearbeiten" : "Manuell erfassen"} — Änderung läuft durchs Gate & ins Flat File
                  </summary>
                  <form action={saveContentManual} className="mt-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="section" value={key} />
                    <textarea
                      name="content"
                      rows={key === "title" ? 2 : key === "highlights" ? 2 : key === "bullets" ? 6 : key === "qa" ? 6 : 5}
                      defaultValue={
                        key === "bullets"
                          ? (payload?.items ?? []).join("\n")
                          : key === "qa"
                            ? (payload?.pairs ?? []).map((pr) => `${pr.q} => ${pr.a}`).join("\n")
                            : payload?.text ?? ""
                      }
                      placeholder={
                        key === "bullets" ? "Ein Bullet pro Zeile (HEADLINE: Text …)" : key === "qa" ? "Frage? => Antwort (eine Zeile pro Paar)" : undefined
                      }
                      className={`${input} font-mono text-xs`}
                    />
                    <button className="btn-dark mt-1.5 text-xs">
                      Speichern als neue Version (v{(v?.version ?? 0) + 1})
                    </button>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
