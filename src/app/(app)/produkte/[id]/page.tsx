import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { saveKeywords, deriveKeywordsFromSov, generateContent, deleteProductAction, uploadCerebro, scrapeReviewsAction, analyzeReviewsAction, importListingFromAmazon, uploadListingCsv, saveContentManual, approveContent, saveMarginCalc, toggleKeywordRelevanz, deleteKeywordBasis, saveZusatzKontext, saveMarke, findeBlockerAction } from "@/app/actions";
import type { ValidationIssue } from "@/db/schema";
import { AMAZON_CATEGORIES } from "@/lib/margin/fees";
import { SubmitButton } from "@/components/submit-button";
import { AsinChips } from "@/components/asin-chips";
import { AussortierteKeywords } from "@/components/aussortierte-keywords";
import { FehlerPopup } from "@/components/fehler-popup";
import { LoeschButton } from "@/components/loesch-button";
import { MarkeFeld } from "@/components/marke-feld";
import { amazonDomain, SPRACH_NAMEN } from "@/lib/text/sprache";
import { GenerierSperre, GenerierButton } from "@/components/generier-sperre";
import { BewertungsDashboard } from "@/components/bewertungs-dashboard";
import { InsightKarte } from "@/components/insight-karte";
import { fehlerInfo } from "@/lib/fehlercodes";
import { normalisierePayload } from "@/lib/reviews/insights";
import { IconUpload, IconCheck, IconSearch, IconReviews, IconContent, IconEuro, IconSichtbarkeit, IconSparkle } from "@/components/icons";
import { AnalyseStart } from "@/components/analyse-start";
import { TabLeiste } from "@/components/tab-leiste";
import { ListingKontrolle, MassnahmenBlock } from "@/components/listing-kontrolle";
import { AnalyseHintergrund } from "@/components/analyse-hintergrund";
import { analyzeListing, wirksamesListing } from "@/lib/analysis/listingAudit";
import type { SovAudit } from "@/lib/sov/audit";

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
  searchParams: Promise<{ fehler?: string; code?: string; hinweis?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { fehler, code, hinweis, tab: tabParam } = await searchParams;
  // Reiter nach dem Analyse-Lauf (D172): Content vorn als Hauptaspekt,
  // Analyse bündelt ALLES Hintergrundwissen — keine Schritt-Reiter mehr.
  const TABS = [
    { key: "listing", label: "Amazon Listing" },
    { key: "content", label: "Content" },
    { key: "analyse", label: "Analyse" },
    { key: "marge", label: "Marge" },
  ] as const;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "listing";
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
  const blockerLauf = await db.query.conversionBlockers.findFirst({
    where: eq(schema.conversionBlockers.productId, id),
    orderBy: desc(schema.conversionBlockers.createdAt),
  });
  const deepAudit = await db.query.deepAudits.findFirst({
    where: eq(schema.deepAudits.productId, id),
    orderBy: desc(schema.deepAudits.createdAt),
  });
  const featureRanking = await db.query.featureRankings.findFirst({
    where: eq(schema.featureRankings.productId, id),
    orderBy: desc(schema.featureRankings.createdAt),
  });
  const latestOf = (t: string) => versions.find((v) => v.type === t);
  const input = "input-base";
  const mc = product.marginCalc ?? null;
  const mi = mc?.inputs;
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
  const fmtEur = (n: number) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
  const fmtPct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} %`;

  const parentBrand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const backHref = parentBrand?.kind === "workbench" ? "/optimizer" : `/marke/${product.brandId}/katalog`;
  // Der aktuelle Scrape ist analysiert (D79) → kein Analyse-Button mehr, nur Dashboard.
  // Altbestand ohne scrapeId: Analyse nach dem Scrape gilt als dessen Analyse.
  const scrapeAnalyzed = Boolean(
    insights && scrape && (insights.scrapeId === scrape.id || (!insights.scrapeId && insights.createdAt > scrape.createdAt)),
  );

  // Kontrollvariablen (D172): Regel-Messung + KI-Befunde direkt im Listing-Reiter
  const { snapshot: wirksam, quellen: sektionsQuellen } = wirksamesListing(versions, snapshot ?? null);
  const sovAudit = (sovUpload?.parsed as { audit?: SovAudit })?.audit ?? null;
  const analysis = analyzeListing({
    snapshot: wirksam,
    facts: product.facts,
    primaryKeywords: kws.filter((k) => k.tier === "primary" && !k.ausgeschlossen).map((k) => k.keyword),
    sovAudit,
    reviewInsights: insights?.payload ?? null,
  });
  const auditNeuestesInput = Math.max(
    snapshot?.createdAt.getTime() ?? 0,
    insights?.createdAt.getTime() ?? 0,
    versions[0]?.createdAt.getTime() ?? 0,
    scrape?.createdAt.getTime() ?? 0,
    sovUpload?.createdAt.getTime() ?? 0,
  );
  const auditStale = !deepAudit || auditNeuestesInput > deepAudit.createdAt.getTime();
  const sektionSoll = { title: wirksam.title, bullets: wirksam.bullets.join(" "), description: wirksam.description };

  return (
    <main className="w-full p-8">
      <Link href={backHref} className="text-xs text-neutral-500 hover:underline">← {parentBrand?.kind === "workbench" ? "Listing Optimizer" : "Katalog"}</Link>
      {/* Produkt-Kopfkarte (D166): EINE immer sichtbare Übersicht über alle Reiter —
          Bild, Listing-Titel, ASIN, Stand, editierbare Steuergrößen, Reviews analysiert. */}
      {(() => {
        const bild = snapshot?.imageUrls?.[0];
        const stand = [snapshot?.createdAt, insights?.createdAt, versions[0]?.createdAt]
          .filter((d): d is Date => Boolean(d))
          .sort((a, b) => b.getTime() - a.getTime())[0];
        const reviewsAnalysiert = insights ? normalisierePayload(insights.payload).stats.reviewsTotal : null;
        return (
          <section className="card mt-2 p-4">
            <div className="flex flex-wrap items-start gap-4">
              {bild && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={bild} alt={product.name} className="h-20 w-20 flex-none rounded-xl border border-hair bg-white object-contain p-1" />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="page-title">{product.name}</h1>
                {snapshot?.title && snapshot.title !== product.name && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{snapshot.title}</p>
                )}
                {/* Marktplatz + Content-Sprache sind nach dem Anlegen fest (D169) — hier nur Anzeige */}
                <p className="mt-1 text-xs text-muted">
                  {product.asin && <span className="font-mono">{product.asin} · </span>}
                  amazon.{amazonDomain(product.marketplace)} · {SPRACH_NAMEN[product.contentSprache]}
                  {stand && <> · Stand {stand.toLocaleDateString("de-DE")}</>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <MarkeFeld action={saveMarke} productId={product.id} wert={product.marke ?? ""} />
                  <LoeschButton
                    action={deleteProductAction}
                    felder={{ productId: product.id }}
                    frage={`„${product.name}" mit allen Daten (Keywords, Scrapes, Analysen, Content) endgültig löschen?`}
                    title="Produkt löschen"
                  />
                </div>
              </div>
              {reviewsAnalysiert !== null && reviewsAnalysiert > 0 && (
                <div className="flex-none rounded-xl bg-background px-4 py-2 text-center">
                  <div className="text-xl font-semibold tabular-nums">{fmt(reviewsAnalysiert)}</div>
                  <div className="text-[10px] text-muted">Reviews analysiert</div>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}
      {hinweis && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm text-primary-strong">ℹ {hinweis}</p>}

      {/* Reiter-Leiste (D172): erst nach dem Analyse-Lauf — davor führt die Start-Maske.
          Mit Sofort-Feedback beim Wechsel (D173). */}
      {insights && (
        <TabLeiste
          basisHref={`/produkte/${product.id}`}
          tabs={[...TABS]}
          aktiv={tab}
          extra={[{ href: `/produkte/${product.id}/briefs`, label: "Briefings" }]}
        />
      )}

      <div className="stagger mt-6 space-y-3">
        {insights && tab === "listing" && (
        <section className="card p-5">
          <CardHead
            icon={<IconUpload />}
            chip="chip-violet"
            title="Amazon Listing"
                        right={
              <>
                {snapshot && <span className="pill pill-good">✓ {snapshot.createdAt.toLocaleDateString("de-DE")}</span>}
                {snapshot && ["apify", "anthropic", "crawler"].includes(snapshot.source) && Date.now() - snapshot.createdAt.getTime() < 24 * 60 * 60 * 1000 ? (
                  <span className="text-[11px] text-muted"></span>
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
              {/* Erweiterte Quellen (D145): null = vom Import-Weg nicht erfasst — ehrlich sagen, nie als „leer" deuten */}
              <p className="mt-1 text-muted">
                {snapshot.attributes ? `${Object.keys(snapshot.attributes).length} Attribute` : "Attribute: nicht erfasst"}
                {" · "}
                {snapshot.importantInfo ? `Wichtige Informationen ${fmt(snapshot.importantInfo.length)} Zeichen` : "Wichtige Informationen: nicht erfasst"}
                {" · "}
                {snapshot.aplusContent ? `A+-Inhalt ${fmt(snapshot.aplusContent.length)} Zeichen` : "A+-Inhalt: nicht erfasst"}
              </p>
              {snapshot.attributes && (
                <p className="mt-1 text-muted">
                  {Object.entries(snapshot.attributes).slice(0, 5).map(([k, v]) => `${k}: ${v.slice(0, 40)}`).join(" · ")}
                  {Object.keys(snapshot.attributes).length > 5 ? " · …" : ""}
                </p>
              )}
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
          {snapshot?.bilderText && snapshot.bilderText.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">Bildanalyse: {snapshot.bilderText.length} Bilder erfasst · fließt in Analyse & Content ein</p>
          )}
          {snapshot && !snapshot.bilderText && (snapshot.imageUrls?.length ?? 0) > 0 && (
            <p className="mt-2 text-[11px] text-muted">Bildanalyse folgt automatisch beim nächsten Listing-Import.</p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Alternativ: Helium-10-Export (CSV) importieren</summary>
            <form action={uploadListingCsv} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <input type="file" name="file" accept=".csv" required className="text-sm" />
              <SubmitButton className="btn-ghost text-xs">Importieren</SubmitButton>
            </form>
          </details>
          {/* Kontrollvariablen direkt hier (D172): Scores nicht in einem Zweit-Level-Bericht */}
          <ListingKontrolle analysis={analysis} deepAudit={deepAudit ?? null} quellen={sektionsQuellen} original={snapshot ?? null} sektionSoll={sektionSoll} />
        </section>
        )}
        {/* Maßnahmen gehighlightet unten im Übersichtsreiter (D172) */}
        {insights && tab === "listing" && <MassnahmenBlock analysis={analysis} deepAudit={deepAudit ?? null} />}


        {/* Keywords: in der Start-Phase der Prüf-Schritt vor dem Lauf (D172),
            danach Teil des gebündelten Analyse-Reiters */}
        {(!insights || tab === "analyse") && (
        <section className="card p-5">
            <CardHead
              icon={<IconSearch />}
              chip="chip-pink"
              title="Keywords"
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
              <input name="price" type="text" inputMode="decimal" defaultValue={product.price !== null ? (product.price / 100).toFixed(2) : ""} placeholder="Ø-Verkaufspreis € *" required className="input w-40 text-xs" title="Basis der €-Werte im SOV-Audit" />
              <SubmitButton className="btn-primary" pendingLabel="Liest Export, filtert Relevanz…" progress>
                {kws.some((k) => k.source === "cerebro") ? "Weiteren Export dazuladen" : "Keyword-Export hochladen"}
              </SubmitButton>
            </form>
            <p className="mt-2 text-[11px] text-muted">
              Keyword-Basis inkl. Relevanz-Filter entsteht automatisch.
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
            {(() => {
              const audit = (sovUpload?.parsed as { audit?: import("@/lib/sov/audit").SovAudit })?.audit;
              if (!audit) return null;
              return (
                <div className="mt-3 rounded-xl border border-hair p-3">
                  <h3 className="text-xs font-semibold">SOV-Audit — {audit.quickWins.length} Quick Wins · {audit.topDemandGaps.length} Top-Umsatzlücken</h3>
                  <ul className="mt-2 space-y-0.5">
                    {audit.topDemandGaps.slice(0, 5).map((g) => (
                      <li key={g.keyword} className="flex items-baseline justify-between gap-2 text-xs">
                        <span>{g.keyword}</span>
                        <span className="flex-none tabular-nums text-muted">{g.sv ? `${fmt(g.sv)} SV` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
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
                        <span className="group/kw inline-flex items-center gap-1 rounded-full bg-[rgb(47_158_143/0.12)] px-2.5 py-1 text-xs text-good">
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
            {/* Aussortierte Keywords (D87/D165): sichtbar + durchsuchbar, EIN Klick zur Wiederaufnahme */}
            <AussortierteKeywords
              eintraege={kws.filter((k) => k.ausgeschlossen).map((k) => ({ id: k.id, keyword: k.keyword, searchVolume: k.searchVolume, grund: k.ausschlussGrund }))}
              productId={product.id}
              action={toggleKeywordRelevanz}
            />
            {/* Basis löschen (D94/D162): Icon + Rückfrage statt Aufklapp-Text */}
            {kws.some((k) => k.source === "cerebro") && (
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-bad">
                Keyword-Basis löschen
                <LoeschButton
                  action={deleteKeywordBasis}
                  felder={{ productId: product.id }}
                  frage={`Alle ${kws.filter((k) => k.source === "cerebro").length} Upload-Keywords samt SOV-Audit endgültig löschen? Manuelle Keywords und Relevanz-Entscheidungen bleiben erhalten.`}
                  title="Keyword-Basis löschen"
                  className="rounded-lg p-1.5 text-bad transition hover:bg-[rgb(220_38_38/0.08)]"
                />
              </div>
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
        )}

        {/* Start-Phase (D172): Zusatz-Infos + EIN Klick für den ganzen Lauf */}
        {!insights && (
        <section className="card p-5">
          <CardHead icon={<IconSparkle />} chip="chip-violet" title="Analyse & Content" />
          <details className="mt-3" open={Boolean(product.zusatzKontext?.trim())}>
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
          <AnalyseStart productId={product.id} mainAsin={product.asin} />
        </section>
        )}

        {insights && tab === "analyse" && (<>
        <section id="reviews" className="card p-5">
          <CardHead
            icon={<IconReviews />}
            chip="chip-violet"
            title="Bewertungen"
            right={insights ? <span className="pill pill-good">✓ analysiert · {insights.confidence}</span> : undefined}
          />

          {/* Chip-Eingabe (D95): Haupt-ASIN vorbelegt (entfernbar), Wettbewerber per Leertaste/Komma als Chips */}
          <form action={scrapeReviewsAction} className="mt-4 flex flex-wrap items-start gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <AsinChips name="asins" mainAsin={product.asin} />
            <SubmitButton className="btn-dark flex-none" disabled={!product.asin} pendingLabel="Scrapt Reviews…" progress>
              {scrape ? "Neu scrapen + analysieren" : "Scrapen + analysieren"}
            </SubmitButton>
          </form>
          {!product.asin && <p className="mt-2 text-xs text-warn">△ Dafür braucht das Produkt eine ASIN.</p>}
          {scrape && (() => {
            // Zahlen-Basen NIE mischen (D129, Nutzer-Befund): Die Amazon-Gesamtzahl
            // und die %-Verteilung gehören zum PRODUKT — daneben dürfen nur die
            // Reviews des Produkts stehen, nicht die Summe inkl. Wettbewerber.
            const eigene = product.asin ? scrape.reviews.filter((r) => r.asin === product.asin) : scrape.reviews;
            const fremdAnzahl = scrape.reviews.length - eigene.length;
            const fremdAsins = Object.keys(scrape.perAsin).filter((a) => a !== product.asin).length;
            const eigeneJeKlasse: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
            for (const r of eigene) eigeneJeKlasse[String(Math.min(5, Math.max(1, Math.round(r.rating))))] += 1;
            return (
            <div className="mt-3 rounded-xl bg-background p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">
                  {scrape.amazonTotals?.reviewsTotal != null ? (
                    <>
                      Auf Amazon: {fmt(scrape.amazonTotals.reviewsTotal)} Bewertungen
                      {scrape.amazonTotals.ratingAvg != null && <> · Ø {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(scrape.amazonTotals.ratingAvg)} ★</>}
                      {" — davon "}{eigene.length} vom Produkt gescraped
                      {fremdAnzahl > 0 && <> (+ {fremdAnzahl} aus {fremdAsins} Wettbewerber-ASIN{fremdAsins === 1 ? "" : "s"})</>}
                    </>
                  ) : (
                    <>Stichprobe: {scrape.reviews.length} Reviews gescraped</>
                  )}
                  {" · "}{scrape.createdAt.toLocaleDateString("de-DE")}
                  {scrape.source !== "apify" && <span className="ml-1 pill pill-warn">Demo-Daten (kein Scrape-Key)</span>}
                </span>
              </div>
              {/* Sterne-Gruppierung (D172): schlecht = 1–3★ · neutral = 4★ · positiv = 5★ */}
              {scrape.amazonTotals?.dist ? (
                /* Echte Amazon-Verteilung (%) des PRODUKTS; daneben NUR die Produkt-Stichprobe */
                <div className="mt-2 space-y-1">
                  {([
                    ["Positiv", "5 ★", ["5"], "var(--cat-2)"],
                    ["Neutral", "4 ★", ["4"], "var(--warn)"],
                    ["Schlecht", "1–3 ★", ["1", "2", "3"], "var(--bad)"],
                  ] as const).map(([label, sterne, keys, farbe]) => {
                    const pct = keys.reduce((s, k) => s + (scrape.amazonTotals!.dist![k] ?? 0), 0);
                    const n = keys.reduce((s, k) => s + (eigeneJeKlasse[k] ?? 0), 0);
                    return (
                      <div key={label} className="flex items-center gap-2 text-xs tabular-nums">
                        <span className="w-28 flex-none text-muted">{label} · {sterne}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-hair">
                          <div className="bar-fill h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: farbe }} />
                        </div>
                        <span className="w-32 flex-none text-right font-medium">{pct} % · {n} gescraped</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Ohne echte Verteilung KEINE Verhältnis-Balken — die Stichprobe ist je Klasse gedeckelt */
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([
                    ["Positiv · 5 ★", ["5"]],
                    ["Neutral · 4 ★", ["4"]],
                    ["Schlecht · 1–3 ★", ["1", "2", "3"]],
                  ] as const).map(([label, keys]) => (
                    <span key={label} className="rounded-full bg-hair px-2.5 py-1 text-xs tabular-nums">{label} · {keys.reduce((s, k) => s + (scrape.starCounts[k] ?? 0), 0)} gescraped</span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Je ASIN und Sterne-Klasse bis zu 100 aktuellste geschriebene Rezensionen. </p>
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
                </div>
              ) : (
                <form action={analyzeReviewsAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <SubmitButton className="btn-primary" pendingLabel="KI wertet Pain Points & Kaufauslöser aus…" progress>
                    Analyse nachholen
                  </SubmitButton>
                  <span className="text-[11px] text-muted">Normalerweise läuft die Analyse automatisch nach dem Scrape — dieser Knopf holt sie nach, falls sie fehlgeschlagen ist.</span>
                  {insights && (
                    <span className="text-[11px] text-muted">Neuer Scrape seit der letzten Analyse — Analyse aktualisieren.</span>
                  )}
                </form>
              )}
            </div>
            );
          })()}
        </section>
        {insights && <BewertungsDashboard insight={insights} scrape={scrape ?? null} productId={product.id} productAsin={product.asin} />}
        </>)}

        {insights && tab === "analyse" && (
        <section className="card p-5">
          <CardHead
            icon={<IconSichtbarkeit />}
            chip="chip-amber"
            title="Conversion-Blocker"
            right={
              <form action={findeBlockerAction}>
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton className="btn-primary" disabled={!snapshot || !insights} pendingLabel="Prüft Listing gegen Kunden-Themen…" progress>
                  {blockerLauf ? "Neu prüfen" : "Blocker finden"}
                </SubmitButton>
              </form>
            }
          />
          <p className="mt-2 text-xs text-muted">Kunden-Themen mit echtem Gewicht, die Listing und Bilder nicht beantworten. Jeder Blocker zeigt die belegenden Kunden-Themen.</p>
          {(!snapshot || !insights) && (
            <p className="mt-3 text-xs text-warn">△ Dafür braucht es das importierte Listing und die Bewertungs-Analyse.</p>
          )}
          {blockerLauf && (
            <>
              <div className="stagger mt-4 space-y-2">
                {blockerLauf.payload.cards.map((k, i) => (
                  <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={blockerLauf.payload.stats.reviewsGesamt} />
                ))}
                {blockerLauf.payload.cards.length === 0 && (
                  <p className="text-sm">✓ Kein Blocker gefunden. Die wichtigen Kunden-Themen sind im Listing beantwortet.</p>
                )}
              </div>
              <div className="mt-3 space-y-0.5">
                {blockerLauf.payload.hinweise.map((h, i) => (
                  <p key={i} className="text-[11px] text-muted">ℹ {h}</p>
                ))}
                {blockerLauf.payload.verworfen > 0 && (
                  <p className="text-[11px] text-warn">△ {blockerLauf.payload.verworfen} Blocker ohne echten Kunden-Aspekt verworfen.</p>
                )}
                <p className="text-[11px] text-muted">Datenbasis: {blockerLauf.dataBasis.join(" · ")} · Stand {blockerLauf.createdAt.toLocaleDateString("de-DE")}</p>
              </div>
            </>
          )}
        </section>
        )}

        {/* Restliches Hintergrundwissen (D172): Zielgruppe/USPs, Sterne-Gruppen, SOV, Feature-Ranking, Stärken & Schwächen */}
        {insights && tab === "analyse" && (
          <AnalyseHintergrund
            productId={product.id}
            analysis={analysis}
            deepAudit={deepAudit ?? null}
            auditStale={auditStale}
            featureRanking={featureRanking ?? null}
            original={snapshot ?? null}
          />
        )}

        {insights && tab === "content" && (
        <section className="card p-5">
          <CardHead
            icon={<IconContent />}
            chip="chip-teal"
            title="Content"
          />
          {/* Zusatz-Infos (D108): fließen in JEDE Generierung ein */}
          <details className="mt-3">
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
          {/* EIN Weg je Sektion (D172): der Lauf hat generiert — hier steht das
              Ergebnis, je Sektion genau EIN Neu-generieren */}
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
                      <form action={generateContent}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="section" value={key} />
                        <GenerierButton>{v ? "Neu generieren" : "Generieren"}</GenerierButton>
                      </form>
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
        )}

        {insights && tab === "marge" && (
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
        )}
      </div>
    </main>
  );
}
