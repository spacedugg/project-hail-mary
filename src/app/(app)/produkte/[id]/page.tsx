import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { saveKeywords, deriveKeywordsFromSov, generateContent, uploadCerebro, scrapeReviewsAction, analyzeReviewsAction, importListingFromAmazon, uploadListingCsv, saveContentManual, approveContent, saveMarginCalc, toggleKeywordRelevanz, deleteKeywordBasis, saveZusatzKontext } from "@/app/actions";
import type { ValidationIssue } from "@/db/schema";
import { AMAZON_CATEGORIES } from "@/lib/margin/fees";
import { SubmitButton } from "@/components/submit-button";
import { AsinChips } from "@/components/asin-chips";
import { FehlerPopup } from "@/components/fehler-popup";
import { GenerierSperre, GenerierButton } from "@/components/generier-sperre";
import { fehlerInfo } from "@/lib/fehlercodes";
import { IconUpload, IconCheck, IconSearch, IconReviews, IconContent, IconEuro } from "@/components/icons";

export const dynamic = "force-dynamic";
// Apify-Scrapes & LLM-Generierung: sonnet-5 denkt adaptiv und braucht bei
// großen Prompts teils Minuten (D118, Nutzer-Befund GEN-01 Backend-Keywords).
// 300 s ist das Maximum des Vercel-Plans; der LLM-Abbruch liegt bei 270 s.
export const maxDuration = 300;

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

/** Einheitlicher Kachel-Kopf (Werkbank-Redesign D77): Icon-Chip + Titel + EIN kurzer Untertitel. */
function CardHead({ icon, chip, title, sub, right }: { icon: React.ReactNode; chip: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex items-center gap-3">
        <span className={`icon-chip ${chip}`}>{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {right && <div className="flex flex-none items-center gap-2">{right}</div>}
    </div>
  );
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fehler?: string; code?: string; hinweis?: string }>;
}) {
  const { id } = await params;
  const { fehler, code, hinweis } = await searchParams;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();

  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) });
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, id),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  const scrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, id),
    orderBy: desc(schema.reviewScrapes.createdAt),
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
  const mc = product.marginCalc ?? null;
  const mi = mc?.inputs;
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
  const fmtEur = (n: number) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
  const fmtPct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} %`;

  const parentBrand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const backHref = parentBrand?.kind === "workbench" ? "/optimizer" : `/marke/${product.brandId}/katalog`;
  const hasFacts = Boolean(f.productType || f.dimensions || f.materials?.length || f.usps?.length || f.targetAudience || f.certifications?.length);
  // Der aktuelle Scrape ist analysiert (D79) → kein Analyse-Button mehr, nur Dashboard.
  // Altbestand ohne scrapeId: Analyse nach dem Scrape gilt als dessen Analyse.
  const scrapeAnalyzed = Boolean(
    insights && scrape && (insights.scrapeId === scrape.id || (!insights.scrapeId && insights.createdAt > scrape.createdAt)),
  );

  return (
    <main className="w-full p-8">
      <Link href={backHref} className="text-xs text-neutral-500 hover:underline">← {parentBrand?.kind === "workbench" ? "Listing Optimizer" : "Katalog"}</Link>
      <div className="mt-1 flex items-center justify-between gap-4">
        <h1 className="page-title">
          {product.name}{" "}
          {product.asin && <span className="font-mono text-sm text-neutral-500">{product.asin} · amazon.{product.marketplace}</span>}
        </h1>
        <div className="flex flex-none gap-2">
          {snapshot || versions.length > 0 ? (
            <>
              <Link href={`/produkte/${product.id}/briefs`} className="btn-ghost font-medium">Creative-Briefs</Link>
              <Link href={`/produkte/${product.id}/analyse`} className="btn-primary font-medium">Analyse öffnen →</Link>
            </>
          ) : (
            <span className="text-xs text-muted">Analyse & Briefs werden aktiv, sobald ein Listing geladen ist.</span>
          )}
        </div>
      </div>

      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}
      {hinweis && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm text-primary-strong">ℹ {hinweis}</p>}

      <div className="stagger mt-6 space-y-3">
        {/* Original-Listing (inkl. Bildplätze) */}
        <section className="card p-5">
          <CardHead
            icon={<IconUpload />}
            chip="chip-violet"
            title="Original-Listing"
            sub="ASIN genügt — Titel, Bullets, Bilder und Bewertungs-Basics werden geladen."
            right={
              <>
                {snapshot && <span className="pill pill-good">✓ {snapshot.createdAt.toLocaleDateString("de-DE")}</span>}
                {snapshot && ["apify", "anthropic", "crawler"].includes(snapshot.source) && Date.now() - snapshot.createdAt.getTime() < 24 * 60 * 60 * 1000 ? (
                  <span className="text-[11px] text-muted">Stand von heute — neu laden ab morgen</span>
                ) : (
                  <form action={importListingFromAmazon}>
                    <input type="hidden" name="productId" value={product.id} />
                    <SubmitButton disabled={!product.asin} className="btn-primary disabled:opacity-40" pendingLabel="Lädt Listing…" progress>
                      {snapshot ? "Neu laden" : "Von Amazon laden"}
                    </SubmitButton>
                  </form>
                )}
              </>
            }
          />
          {snapshot && (
            <div className="mt-4 rounded-xl bg-background p-3 text-xs">
              {snapshot.title && <p className="font-medium">{snapshot.title}</p>}
              {snapshot.bullets && snapshot.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-muted">{snapshot.bullets.slice(0, 5).map((b, i) => <li key={i}>• {b.slice(0, 140)}{b.length > 140 ? "…" : ""}</li>)}</ul>
              )}
              <p className="mt-2 text-muted">
                {snapshot.description ? `Beschreibung ${fmt(snapshot.description.length)} Zeichen` : "keine Beschreibung"} · {snapshot.imageUrls?.length ?? 0} Bilder
                {snapshot.reviewsTotal !== null && <> · <b className="text-foreground">{fmt(snapshot.reviewsTotal)} Bewertungen</b></>}
                {snapshot.ratingAvg !== null && <> · Ø {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(snapshot.ratingAvg)} ★</>}
                {snapshot.ratingDist && <> · {(["5", "4", "3", "2", "1"] as const).filter((s) => snapshot.ratingDist![s] !== undefined).map((s) => `${s}★ ${snapshot.ratingDist![s]} %`).join(" · ")}</>}
              </p>
            </div>
          )}
          {snapshot?.imageUrls && snapshot.imageUrls.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => {
                const url = snapshot.imageUrls?.[i];
                return (
                  <div key={i} className="rounded-xl border border-hair p-1.5 text-center">
                    {url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt={`Slot ${i + 1}`} className="mx-auto h-16 w-full rounded object-contain" />
                    ) : (
                      <div className="flex h-16 items-center justify-center text-lg text-neutral-300">＋</div>
                    )}
                    <div className="mt-1 text-[9px] uppercase tracking-wide text-neutral-400">{i === 0 ? "Hauptbild" : `Slot ${i + 1}`}</div>
                  </div>
                );
              })}
            </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Alternativ: Helium-10-Export (CSV) importieren</summary>
            <form action={uploadListingCsv} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <input type="file" name="file" accept=".csv" required className="text-sm" />
              <SubmitButton className="btn-ghost text-xs">Importieren</SubmitButton>
            </form>
          </details>
        </section>

        {/* Produkt-Wahrheit — reine Anzeige, KEIN Formular (D77) */}
        <section className="card p-5">
          <CardHead
            icon={<IconCheck />}
            chip="chip-teal"
            title="Produkt-Wahrheit — automatisch abgeleitet"
            sub="Aus Listing-Import und Tiefen-Audit. Dient den Texten & Briefs als Fakten-Anker."
          />
          {hasFacts ? (
            <div className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
              {f.productType && <div><div className="text-[10px] uppercase tracking-wide text-neutral-400">Produkttyp</div><div className="mt-0.5">{f.productType}</div></div>}
              {f.dimensions && <div><div className="text-[10px] uppercase tracking-wide text-neutral-400">Maße / Menge</div><div className="mt-0.5">{f.dimensions}</div></div>}
              {(f.materials?.length ?? 0) > 0 && (
                <div className="sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">Materialien</div>
                  <div className="mt-1 flex flex-wrap gap-1">{f.materials!.map((m, i) => <span key={i} className="tag">{m}</span>)}</div>
                </div>
              )}
              {(f.usps?.length ?? 0) > 0 && (
                <div className="sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">USPs (hergeleitet)</div>
                  <ul className="mt-1 space-y-0.5">{f.usps!.map((u, i) => <li key={i}>✓ {u}</li>)}</ul>
                </div>
              )}
              {f.targetAudience && <div className="sm:col-span-2"><div className="text-[10px] uppercase tracking-wide text-neutral-400">Zielgruppe (aus Reviews)</div><div className="mt-0.5">{f.targetAudience}</div></div>}
              {(f.certifications?.length ?? 0) > 0 && (
                <div className="sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">Zertifikate</div>
                  <div className="mt-1 flex flex-wrap gap-1">{f.certifications!.map((c, i) => <span key={i} className="tag">{c}</span>)}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Noch nichts abgeleitet — Listing laden, Bewertungs-Analyse fahren, Tiefen-Audit starten. Alles füllt sich von selbst.</p>
          )}
        </section>

        {/* Keyword-Basis (D89): EIN Upload — Cerebro-Export → Keywords immer, SOV wenn Wettbewerber drin */}
        <section className="card p-5">
            <CardHead
              icon={<IconSearch />}
              chip="chip-pink"
              title="Keyword-Basis (Helium 10 Cerebro)"
              sub="Cerebro-Export der zu optimierenden ASIN hochladen — optional mit Wettbewerber-ASINs, dann entsteht zusätzlich das SOV-Audit."
              right={
                <>
                  {kws.length > 0 && <span className="pill pill-neutral">{kws.filter((k) => !k.ausgeschlossen).length} aktiv</span>}
                  {sovUpload && ((sovUpload.parsed as { audit?: unknown })?.audit
                    ? <span className="pill pill-good">✓ SOV-Audit</span>
                    : <span className="pill pill-neutral">ohne SOV (keine Wettbewerber im Export)</span>)}
                </>
              }
            />
            <form action={uploadCerebro} className="mt-4 flex flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <input type="file" name="file" accept=".csv" required className="text-sm" />
              <input name="price" type="number" step="0.01" placeholder="Ø-Preis € (45)" className={`${input} w-36`} />
              <SubmitButton className="btn-primary" pendingLabel="Liest Export, filtert Relevanz…" progress>
                {kws.some((k) => k.source === "cerebro") ? "Weiteren Export dazuladen" : "Keyword-Export hochladen"}
              </SubmitButton>
            </form>
            <p className="mt-2 text-[11px] text-muted">
              Eine Datei, alles drin: Keyword-Basis entsteht immer (inkl. Relevanz-Filter — Marken, abweichende Maße/Anzahlen).
              Enthält der Export Wettbewerber-ASIN-Spalten, entsteht daraus zusätzlich das SOV-Audit — nichts wird doppelt hochgeladen.
              {kws.some((k) => k.source === "cerebro") && (
                <> Ein weiterer Upload ersetzt nichts: neue Datei und bestehende Basis werden zusammengeführt, identische Keywords erscheinen nur einmal.</>
              )}
            </p>
            {sovUpload && kws.filter((k) => k.source === "cerebro").length === 0 && (
              <form action={deriveKeywordsFromSov} className="mt-3">
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton className="btn-ghost text-xs" pendingLabel="Leitet ab & prüft Relevanz…" progress>
                  Keywords aus dem vorhandenen Upload ableiten
                </SubmitButton>
              </form>
            )}
            {(["primary", "secondary", "tertiary", "backend"] as const).map((tier) => {
              const inTier = kws.filter((k) => k.tier === tier && k.source !== "manual" && !k.ausgeschlossen);
              if (inTier.length === 0) return null;
              return (
                <div key={tier} className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">{tier} · {inTier.length}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {inTier.slice(0, 16).map((k) => (
                      <form key={k.id} action={toggleKeywordRelevanz} className="inline-flex">
                        <input type="hidden" name="keywordId" value={k.id} />
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="aktion" value="ausschliessen" />
                        <span className="tag group/kw inline-flex items-center gap-1">
                          {k.keyword}{k.searchVolume ? ` · ${fmt(k.searchVolume)}` : ""}
                          <button title="Als irrelevant ausschließen" className="text-neutral-400 transition hover:text-bad">×</button>
                        </span>
                      </form>
                    ))}
                    {inTier.length > 16 && <span className="text-[10px] text-neutral-400">… +{inTier.length - 16}</span>}
                  </div>
                </div>
              );
            })}
            {/* Aussortierte Keywords (D87): gekennzeichnet statt gelöscht — prüfbar & wieder aufnehmbar */}
            {kws.some((k) => k.ausgeschlossen) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-warn">
                  △ Aussortiert ({kws.filter((k) => k.ausgeschlossen).length}) — Marken, abweichende Maße/Anzahlen · prüfen & ggf. wieder aufnehmen
                </summary>
                <ul className="mt-2 space-y-1">
                  {kws.filter((k) => k.ausgeschlossen).map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1 text-xs">
                      <span className="min-w-0">
                        <b>{k.keyword}</b>{k.searchVolume ? <span className="text-muted"> · SV {fmt(k.searchVolume)}</span> : ""}
                        <span className="block text-[11px] text-muted">{k.ausschlussGrund}</span>
                      </span>
                      <form action={toggleKeywordRelevanz} className="flex-none">
                        <input type="hidden" name="keywordId" value={k.id} />
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="aktion" value="aufnehmen" />
                        <SubmitButton className="btn-ghost px-2 py-0.5 text-[11px]">↩ aufnehmen</SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {/* Basis löschen (D94): bewusstes Gegenstück zur Zusammenführung — zweistufig statt Sofort-Klick */}
            {kws.some((k) => k.source === "cerebro") && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-bad">Basis komplett löschen …</summary>
                <form action={deleteKeywordBasis} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-background p-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <p className="min-w-0 flex-1 text-[11px] text-muted">
                    Entfernt alle {kws.filter((k) => k.source === "cerebro").length} Upload-Keywords dieses Produkts samt SOV-Audit —
                    manuelle Keywords bleiben. Danach startet der nächste Upload eine frische Basis (statt zusammenzuführen).
                  </p>
                  <SubmitButton className="btn-ghost flex-none text-xs !text-bad" pendingLabel="Löscht Basis…">Ja, Basis löschen</SubmitButton>
                </form>
              </details>
            )}
            <details className="mt-3" open={kws.length > 0 && kws.every((k) => k.source === "manual")}>
              <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                Manuelle Keywords ({kws.filter((k) => k.source === "manual").length})
              </summary>
              <form action={saveKeywords} className="mt-2">
                <input type="hidden" name="productId" value={product.id} />
                <textarea
                  name="keywords"
                  rows={5}
                  defaultValue={kws.filter((k) => k.source === "manual").map((k) => `${k.keyword}${k.searchVolume ? `;${k.searchVolume}` : ""}`).join("\n")}
                  placeholder={"eine Zeile je Keyword, optional ;Suchvolumen\nedelstahl trinkflasche;18100"}
                  className={`${input} font-mono`}
                />
                <SubmitButton className="mt-2 btn-dark text-xs">Speichern</SubmitButton>
              </form>
            </details>
        </section>

        {/* Bewertungs-Analyse */}
        <section id="reviews" className="card p-5">
          <CardHead
            icon={<IconReviews />}
            chip="chip-violet"
            title="Bewertungs-Analyse"
            sub="1 · Reviews scrapen: je ASIN und Sterne-Klasse (1★–5★) eine eigene Anfrage, jeweils die bis zu 100 aktuellsten — 2 · Analyse → Findings-Dashboard."
            right={insights ? <span className="pill pill-good">✓ analysiert · {insights.confidence}</span> : undefined}
          />

          {/* Chip-Eingabe (D95): Haupt-ASIN vorbelegt (entfernbar), Wettbewerber per Leertaste/Komma als Chips */}
          <form action={scrapeReviewsAction} className="mt-4 flex flex-wrap items-start gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <AsinChips name="asins" mainAsin={product.asin} />
            <SubmitButton className="btn-dark flex-none" disabled={!product.asin} pendingLabel="Scrapt Reviews…" progress>
              {scrape ? "Neu scrapen" : "1 · Reviews scrapen"}
            </SubmitButton>
          </form>
          {!product.asin && <p className="mt-2 text-xs text-warn">△ Dafür braucht das Produkt eine ASIN.</p>}
          {scrape && scrape.source === "apify" && Date.now() - scrape.createdAt.getTime() < 24 * 60 * 60 * 1000 && (
            <p className="mt-2 text-[11px] text-muted">Dieselben ASINs werden 24 h nicht doppelt gescraped — neu scrapen lohnt mit zusätzlichen Wettbewerber-ASINs.</p>
          )}

          {scrape && (
            <div className="mt-3 rounded-xl bg-background p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">
                  {scrape.amazonTotals?.reviewsTotal != null ? (
                    <>
                      Auf Amazon: {fmt(scrape.amazonTotals.reviewsTotal)} Bewertungen
                      {scrape.amazonTotals.ratingAvg != null && <> · Ø {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(scrape.amazonTotals.ratingAvg)} ★</>}
                      {" — davon "}{scrape.reviews.length} gescraped
                    </>
                  ) : (
                    <>Stichprobe: {scrape.reviews.length} Reviews gescraped</>
                  )}
                  {" · "}{scrape.createdAt.toLocaleDateString("de-DE")}
                  {scrape.source !== "apify" && <span className="ml-1 pill pill-warn">Demo-Daten (kein Scrape-Key)</span>}
                </span>
                <span className="text-[11px] text-muted">{Object.entries(scrape.perAsin).map(([a, n]) => `${a}: ${n}`).join(" · ")}</span>
              </div>
              {scrape.amazonTotals?.dist ? (
                /* Echte Amazon-Verteilung (%) als Balken; die Stichprobe steht als Zahl daneben */
                <div className="mt-2 space-y-1">
                  {(["5", "4", "3", "2", "1"] as const).map((star) => {
                    const pct = scrape.amazonTotals!.dist![star] ?? 0;
                    const n = scrape.starCounts[star] ?? 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs tabular-nums">
                        <span className="w-8 flex-none text-muted">{star} ★</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-hair">
                          <div className="bar-fill h-full rounded-full" style={{ width: `${pct}%`, background: Number(star) >= 4 ? "var(--cat-2)" : Number(star) === 3 ? "var(--warn)" : "var(--bad)" }} />
                        </div>
                        <span className="w-32 flex-none text-right font-medium">{pct} % · {n} gescraped</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Ohne echte Verteilung KEINE Verhältnis-Balken — die Stichprobe ist je Klasse gedeckelt */
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["5", "4", "3", "2", "1"] as const).map((star) => (
                    <span key={star} className="rounded-full bg-hair px-2.5 py-1 text-xs tabular-nums">{star} ★ · {scrape.starCounts[star] ?? 0} gescraped</span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Gescraped werden geschriebene Rezensionen (je ASIN und Sterne-Klasse die bis zu 100 aktuellsten).
                Amazons Gesamtzahl zählt auch Sterne-Bewertungen OHNE Text mit — die Stichprobe ist deshalb oft deutlich
                kleiner als die Gesamtzahl, ohne dass etwas fehlt. Sie bildet kein Gesamtverhältnis ab; alle Klassen
                fließen in Pain Points und Kaufauslöser ein.
              </p>
              {(scrape.notes?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-0.5">
                  {scrape.notes!.map((n, i) =>
                    /fehl|Zeitlimit/.test(n)
                      ? <p key={i} className="text-[11px] text-warn">△ {n}</p>
                      : <p key={i} className="text-[11px] text-muted">ℹ {n}</p>,
                  )}
                </div>
              )}

              {scrapeAnalyzed ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/produkte/${product.id}/reviews`} className="btn-primary text-xs">
                    Findings-Dashboard öffnen →
                  </Link>
                  <span className="text-[11px] text-muted">Dieser Scrape ist analysiert — für eine neue Analyse erst neu scrapen (z. B. mit weiteren ASINs).</span>
                </div>
              ) : (
                <form action={analyzeReviewsAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <SubmitButton className="btn-primary" pendingLabel="KI wertet Pain Points & Kaufauslöser aus…" progress>
                    2 · Analyse starten
                  </SubmitButton>
                  {insights && (
                    <span className="text-[11px] text-muted">Neuer Scrape seit der letzten Analyse — Analyse aktualisieren.</span>
                  )}
                </form>
              )}
            </div>
          )}
        </section>

        {/* Content */}
        <section className="card p-5">
          <CardHead
            icon={<IconContent />}
            chip="chip-teal"
            title="Content"
            sub="Grundlage ist die Bewertungs-Analyse (Kundensprache, Pain Points). Sektionen werden NACHEINANDER generiert — läuft eine, warten die anderen. Jede Version läuft durchs Validation-Gate."
            right={!insights ? <span className="pill pill-warn">gesperrt — Analyse fehlt</span> : undefined}
          />
          {/* Content-Gate (D108): ohne Bewertungs-Analyse nur mit doppelter Bestätigung */}
          {!insights && (
            <div className="mt-3 rounded-xl bg-[rgb(160_122_31/0.08)] p-3 text-xs">
              <p className="font-medium text-warn">
                △ Content ist gesperrt: Es liegt keine Bewertungs-Analyse vor.
              </p>
              <p className="mt-1 text-muted">
                Die Analyse liefert die Text-Grundlage — echte Kundensprache, Pain Points, Kaufauslöser. Empfohlener Weg:
                oben Reviews scrapen und analysieren. Wer bewusst ohne Analyse generiert, bestätigt das pro Sektion —
                Grundlage sind dann das importierte Listing (IST) und die Zusatz-Infos unten.
              </p>
            </div>
          )}
          {/* Zusatz-Infos (D108): fließen in JEDE Generierung ein */}
          <details className="mt-3" open={!insights && !product.zusatzKontext}>
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
              Zusatz-Infos zum Produkt ({product.zusatzKontext?.trim() ? `${product.zusatzKontext.trim().length} Zeichen hinterlegt` : "leer"}) — fließen in jede Text-Generierung ein
            </summary>
            <form action={saveZusatzKontext} className="mt-2">
              <input type="hidden" name="productId" value={product.id} />
              <textarea
                name="zusatzKontext"
                rows={5}
                defaultValue={product.zusatzKontext ?? ""}
                placeholder={"Alles, was die Texte wissen sollen und nirgends steht:\n· Details/Fakten zum Produkt\n· eigene Bullets/Titel als Ausgangspunkt\n· gute Bullets, Titel, Beschreibungen ANDERER Produkte als Vorbild"}
                className={`${input} w-full`}
              />
              <SubmitButton className="mt-2 btn-dark text-xs">Zusatz-Infos speichern</SubmitButton>
            </form>
          </details>
          <GenerierSperre>
          <div className="mt-4 space-y-3">
            {SECTIONS.map(({ key, label }) => {
              const dbType = key === "backend" ? "backend_keywords" : key === "highlights" ? "item_highlights" : key;
              const v = latestOf(dbType);
              const payload = v?.payload as { text?: string; items?: string[]; pairs?: Array<{ q: string; a: string }>; rationale?: Array<{ part: string; source: string; verified: boolean }> } | undefined;
              return (
                <div key={key} className="rounded-xl border border-hair p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">
                      {label}{" "}
                      {v && <span className="ml-1 tag">v{v.version} · {v.generatedBy}</span>}
                      {v && (v.status === "approved"
                        ? <span className="ml-1 pill pill-good">✓ freigegeben</span>
                        : <span className="ml-1 pill pill-neutral">Entwurf</span>)}
                    </h3>
                    <div className="flex flex-none items-center gap-1.5">
                      {v && v.status === "draft" && (v.validation?.passed ?? true) && (
                        <form action={approveContent}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="versionId" value={v.id} />
                          <SubmitButton className="btn-ghost px-3 py-1 text-xs !text-good">✓ Freigeben</SubmitButton>
                        </form>
                      )}
                      {insights ? (
                        <form action={generateContent}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="section" value={key} />
                          <GenerierButton>{v ? "Neu generieren" : "Generieren"}</GenerierButton>
                        </form>
                      ) : (
                        /* Doppelte Bestätigung (D108): aufklappen + ankreuzen, erst dann generieren */
                        <details className="relative">
                          <summary className="btn-ghost cursor-pointer px-3 py-1 text-xs list-none">🔒 {v ? "Neu generieren" : "Generieren"} …</summary>
                          <form action={generateContent} className="absolute right-0 z-10 mt-1 w-72 rounded-xl border border-hair bg-card p-3 shadow-lg">
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="section" value={key} />
                            <p className="text-[11px] text-muted">
                              Ohne Bewertungs-Analyse fehlen Kundensprache und Pain Points. Grundlage sind dann Listing-IST + Zusatz-Infos.
                            </p>
                            <label className="mt-2 flex items-start gap-2 text-[11px]">
                              <input type="checkbox" name="ohneAnalyseBestaetigt" required className="mt-0.5" />
                              <span>Ja, ich will diese Sektion bewusst ohne Bewertungs-Analyse generieren.</span>
                            </label>
                            <GenerierButton className="mt-2 btn-primary w-full px-3 py-1 text-xs">Trotzdem generieren</GenerierButton>
                          </form>
                        </details>
                      )}
                    </div>
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
                      {v ? "Bearbeiten" : "Manuell erfassen"}
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
                      <SubmitButton className="btn-dark mt-1.5 text-xs">
                        Speichern als v{(v?.version ?? 0) + 1} (läuft durchs Gate)
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
          </GenerierSperre>
        </section>

        {/* Marge & Break-even */}
        <section className="card p-5">
          <CardHead
            icon={<IconEuro />}
            chip="chip-amber"
            title="Marge & Break-even"
            sub="Amazon.de-Gebühren automatisch — der Break-even-ACoS speist die Ampel."
            right={mc ? <span className="pill pill-good">✓ {fmtPct(mc.results.marginPct)} Marge · BEP {fmtPct(mc.results.breakEvenAcos)}</span> : undefined}
          />
          {mc && (
            <div className="stagger mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Marge/Stk", `${fmtEur(mc.results.marginPerUnit)} · ${fmtPct(mc.results.marginPct)}`],
                ["Break-even-ACoS", fmtPct(mc.results.breakEvenAcos)],
                ["ROI", fmtPct(mc.results.roi)],
                ["Auszahlung/Stk", fmtEur(mc.results.payoutPerUnit)],
                ["Amazon-Gebühren/Stk", fmtEur(mc.results.amazonTotalPerUnit)],
                ["davon Verkaufsgebühr", fmtEur(mc.results.referralFee)],
                ["davon Retouren+Entsorgung", fmtEur(mc.results.returnCostPerUnit + mc.results.disposalCostPerUnit)],
                ["Marge gesamt (Bestellung)", fmtEur(mc.results.totals.margin)],
              ] as const).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-hair p-2.5">
                  <div className={`text-sm font-semibold tabular-nums ${l === "Marge/Stk" && mc.results.marginPerUnit < 0 ? "text-bad" : ""}`}>{v}</div>
                  <div className="text-[10px] text-neutral-500">{l}</div>
                </div>
              ))}
            </div>
          )}
          <details className="mt-3" open={!mc}>
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">{mc ? "Eingaben ändern & neu berechnen" : "Kalkulation erfassen"}</summary>
            <form action={saveMarginCalc} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input type="hidden" name="productId" value={product.id} />
              {([
                ["purchasePrice", "Einkauf €/Stk *", mi?.purchasePrice],
                ["sellingPriceGross", "Brutto-VK € *", mi?.sellingPriceGross],
                ["fbaShippingFee", "FBA-Versand €/Stk", mi?.fbaShippingFee],
                ["packagingCost", "Verpackung €/Stk", mi?.packagingCost],
                ["logisticsCost", "Logistik €/Stk", mi?.logisticsCost],
                ["qualityInspection", "QC €/Stk", mi?.qualityInspection],
                ["variableCosts", "Variabel €/Stk", mi?.variableCosts],
                ["orderQty", "Bestellmenge", mi?.orderQty ?? 1],
                ["customsPct", "Zoll %", mi ? Math.round((mi.customsRate ?? 0) * 1000) / 10 : undefined],
                ["vatPct", "MwSt %", mi ? Math.round((mi.vatRate ?? 0.19) * 100) : 19],
                ["returnPct", "Retourenquote %", mi ? Math.round((mi.returnRate ?? 0) * 1000) / 10 : undefined],
                ["disposalPct", "Entsorgungsanteil %", mi ? Math.round((mi.disposalShare ?? 0) * 1000) / 10 : undefined],
                ["dimL", "Karton L (cm)", mi?.dims?.l],
                ["dimW", "Karton B (cm)", mi?.dims?.w],
                ["dimH", "Karton H (cm)", mi?.dims?.h],
                ["weightG", "Gewicht (g)", mi?.weightG ?? undefined],
              ] as const).map(([name, label, val]) => (
                <label key={name} className="block">
                  <span className="mb-0.5 block text-[10px] font-medium text-muted">{label}</span>
                  <input name={name} inputMode="decimal" defaultValue={val ?? ""} required={String(label).includes("*")} className={input} />
                </label>
              ))}
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[10px] font-medium text-muted">Amazon-Kategorie (Verkaufsgebühr)</span>
                <select name="category" defaultValue={mi?.category ?? "Alles andere"} className={input}>
                  {AMAZON_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-2">
                <SubmitButton className="btn-primary">Berechnen & speichern</SubmitButton>
                <Link href="/rechenwerk" className="text-xs text-primary-strong underline">Formeln unter Daten & Formeln</Link>
              </div>
            </form>
          </details>
        </section>
      </div>
    </main>
  );
}
