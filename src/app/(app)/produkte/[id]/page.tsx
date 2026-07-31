import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { erzeugeInsightsDokument, saveKeywords, deriveKeywordsFromSov, generateContent, deleteProductAction, uploadCerebro, analyzeReviewsAction, importListingFromAmazon, uploadListingCsv, saveContentManual, approveContent, resetContentChain, saveMarginCalc, toggleKeywordRelevanz, deleteKeywordBasis, saveZusatzKontext, saveMarke } from "@/app/actions";
import type { ValidationIssue } from "@/db/schema";
import { AMAZON_CATEGORIES } from "@/lib/margin/fees";
import { SubmitButton } from "@/components/submit-button";
import { AussortierteKeywords } from "@/components/aussortierte-keywords";
import { FehlerPopup } from "@/components/fehler-popup";
import { LoeschButton } from "@/components/loesch-button";
import { MarkeFeld } from "@/components/marke-feld";
import { amazonDomain, SPRACH_NAMEN } from "@/lib/text/sprache";
import { GenerierSperre, GenerierButton } from "@/components/generier-sperre";
import { BewertungsDashboard } from "@/components/bewertungs-dashboard";
import { InsightKarte } from "@/components/insight-karte";
import { DriverBlock } from "@/components/driver-karten";
import { CopyLink } from "@/components/copy-link";
import { fehlerInfo } from "@/lib/fehlercodes";
import { normalisierePayload } from "@/lib/reviews/insights";
import { kartenKlasse } from "@/lib/reviews/verdichtung";
import { IconUpload, IconCheck, IconSearch, IconReviews, IconContent, IconEuro, IconSichtbarkeit, IconSparkle } from "@/components/icons";
import { AnalyseStart } from "@/components/analyse-start";
import { TabLeiste } from "@/components/tab-leiste";
import { KopierFeld } from "@/components/kopier-feld";
import { ListingKontrolle, MassnahmenBlock } from "@/components/listing-kontrolle";
import { AnalyseHintergrund } from "@/components/analyse-hintergrund";
import { analyzeListing, wirksamesListing } from "@/lib/analysis/listingAudit";
import { snapshotBildBelege } from "@/lib/analysis/bildAuslese";
import { dbTypFuer, geplanteVorgaenger, wirksamerPlan, SEKTIONS_LABEL } from "@/lib/content/plan";
import { wirksameWerke, WERK_LABEL } from "@/lib/content/werke";
import { WerkAuswahl } from "@/components/werk-auswahl";
import { BildKacheln } from "@/components/bild-kacheln";
import { bereinigeBildUrls } from "@/lib/scrape/bilder";
import type { SovAudit } from "@/lib/sov/audit";
import { ladeFamilie } from "@/lib/variants/laden";
import { FamilieManager } from "@/components/familie-manager";
import { FamilieStruktur } from "@/components/familie-struktur";

export const dynamic = "force-dynamic";
// Apify-Scrapes & LLM-Generierung: sonnet-5 denkt adaptiv und braucht bei
// großen Prompts teils Minuten (D118, Nutzer-Befund GEN-01 Backend-Keywords).
// 300 s ist das Maximum des Vercel-Plans; der LLM-Abbruch liegt bei 270 s.
export const maxDuration = 300;

/** Ketten-Reihenfolge (D195; Backend vor Beschreibung ab D204): Freigabe einer Sektion generiert automatisch die nächste. */
const SECTIONS = [
  { key: "title", label: "Titel" },
  { key: "highlights", label: "Item Highlights" },
  { key: "bullets", label: "Bullet Points" },
  { key: "backend", label: "Backend-Keywords" },
  { key: "description", label: "Beschreibung" },
  { key: "qa", label: "Q&A" },
] as const;

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length)
    return <p className="mt-1 text-xs text-emerald-600">✓ Keine Befunde.</p>;
  // D232: nur die verständliche Meldung listen — keine technische Regel-ID (Jargon),
  // kein extra Container. Der Nutzer will das Finding, nicht den Code-Namen.
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, n) => (
        <li key={n} className={`text-xs ${i.severity === "error" ? "text-red-600" : "text-amber-600"}`}>
          {i.severity === "error" ? "✕" : "△"} {i.message}
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

  // Variations-Familie (D221): Ein NICHT kaufbarer Container-Parent bekommt allein die
  // Familien-Oberfläche. Ein Representative-Parent bleibt eine kaufbare Variante — er behält
  // die volle Content-Werkbank UND bekommt das Familien-Panel oben aufgesetzt.
  if (product.variantRole === "parent" && product.variantParentContainer) {
    const familie = await ladeFamilie(db, product.id);
    if (!familie) notFound();
    return (
      <main className="w-full p-8">
        <FamilieManager familie={familie} />
      </main>
    );
  }
  // Familien-Kontext (D256): Struktur-Tabelle auf JEDER Parent- UND Child-ASIN.
  // Für ein Child wird die Familie über seinen Parent geladen. Die VERWALTUNG
  // (Master ableiten · Slots · Übertragen) bleibt dem Parent vorbehalten.
  const familieAnkerId = product.variantRole === "parent" ? product.id : product.parentProductId;
  const familie = familieAnkerId ? await ladeFamilie(db, familieAnkerId) : null;
  const familiePanel = product.variantRole === "parent" ? familie : null;

  // Unabhängige Queries parallel (Review-Fix): jeder Reiter-Wechsel zahlte
  // vorher 8+ serielle Roundtrips.
  const [kws, insights, scrape, uploads, versions, snapshot, blockerLauf, deepAudit, featureRanking, parentBrand, driverLauf, insightsReports] = await Promise.all([
    db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) }),
    db.query.reviewInsights.findFirst({ where: eq(schema.reviewInsights.productId, id), orderBy: desc(schema.reviewInsights.createdAt) }),
    db.query.reviewScrapes.findFirst({ where: eq(schema.reviewScrapes.productId, id), orderBy: desc(schema.reviewScrapes.createdAt) }),
    db.query.reportUploads.findMany({ where: eq(schema.reportUploads.brandId, product.brandId), orderBy: desc(schema.reportUploads.createdAt) }),
    db.query.contentVersions.findMany({ where: eq(schema.contentVersions.productId, id), orderBy: desc(schema.contentVersions.createdAt) }),
    db.query.listingSnapshots.findFirst({ where: eq(schema.listingSnapshots.productId, id), orderBy: desc(schema.listingSnapshots.createdAt) }),
    db.query.conversionBlockers.findFirst({ where: eq(schema.conversionBlockers.productId, id), orderBy: desc(schema.conversionBlockers.createdAt) }),
    db.query.deepAudits.findFirst({ where: eq(schema.deepAudits.productId, id), orderBy: desc(schema.deepAudits.createdAt) }),
    db.query.featureRankings.findFirst({ where: eq(schema.featureRankings.productId, id), orderBy: desc(schema.featureRankings.createdAt) }),
    db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) }),
    // Conversion Driver (D265) — löst die getrennten Driver-/Blocker-Listen ab,
    // sobald für dieses Produkt ein Lauf existiert.
    db.query.conversionDrivers.findFirst({
      where: eq(schema.conversionDrivers.productId, id),
      orderBy: desc(schema.conversionDrivers.createdAt),
    }),
    // Insights-Dokument (D267): eingefrorene Kunden-Versionen, neueste zuerst.
    db.query.insightsReports.findMany({
      where: eq(schema.insightsReports.productId, id),
      orderBy: desc(schema.insightsReports.version),
      limit: 5,
    }),
  ]);
  // Vergleichsprodukte aus dem Keyword-Export (D268): dieselben Produkte, gegen
  // die die Keyword-Recherche gelaufen ist — sie werden vorbelegt, statt sie ein
  // zweites Mal von Hand zu verlangen.
  const vergleichsAsins = (() => {
    const eigen = uploads.find(
      (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === id,
    );
    const rohe = (eigen?.parsed as { wettbewerberAsins?: unknown } | null)?.wettbewerberAsins;
    if (!Array.isArray(rohe)) return [] as string[];
    const eigeneAsin = product.asin?.trim().toUpperCase();
    return [...new Set(rohe.map((a) => String(a ?? "").trim().toUpperCase()).filter(Boolean))].filter((a) => a !== eigeneAsin);
  })();

  const sovUpload = uploads.find(
    (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === id,
  );
  const latestOf = (t: string) => versions.find((v) => v.type === t);
  const input = "input-base";
  const mc = product.marginCalc ?? null;
  const mi = mc?.inputs;
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
  const fmtEur = (n: number) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
  const fmtPct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} %`;

  // Basis-URL für den Kunden-Link des Insights-Dokuments (D267) — dieselbe
  // Herleitung wie beim Freigabe-Portal, damit Links in allen Umgebungen stimmen.
  const kopfzeilen = await headers();
  const headersListe = {
    proto: kopfzeilen.get("x-forwarded-proto") ?? "http",
    host: kopfzeilen.get("host") ?? "localhost:3000",
  };

  const backHref = parentBrand?.kind === "workbench" ? "/optimizer" : `/marke/${product.brandId}/katalog`;
  // Der aktuelle Scrape ist analysiert (D79) → kein Analyse-Button mehr, nur Dashboard.
  // Altbestand ohne scrapeId: Analyse nach dem Scrape gilt als dessen Analyse.
  const scrapeAnalyzed = Boolean(
    insights && scrape && (insights.scrapeId === scrape.id || (!insights.scrapeId && insights.createdAt > scrape.createdAt)),
  );

  // Ergebnis-Phase (Review-Fix): Reiter erscheinen mit Analyse ODER Content —
  // Produkte ohne Reviews (bewusst ohne Analyse getextet, GEN-03) sonst nie.
  const bereit = Boolean(insights) || versions.length > 0;

  // Kontrollvariablen (D172): Regel-Messung + KI-Befunde direkt im Listing-Reiter
  const { snapshot: wirksam, quellen: sektionsQuellen } = wirksamesListing(versions, snapshot ?? null);
  const sovAudit = (sovUpload?.parsed as { audit?: SovAudit })?.audit ?? null;
  // Nur rechnen, wenn ein Reiter sie zeigt (Review-Fix): Marge/Content zahlten
  // sonst die volle Wortstamm-Analyse bei jedem Wechsel mit.
  const analysis = bereit && (tab === "listing" || tab === "analyse")
    ? analyzeListing({
        snapshot: wirksam,
        facts: product.facts,
        primaryKeywords: kws.filter((k) => k.tier === "primary" && !k.ausgeschlossen).map((k) => k.keyword),
        sovAudit,
        reviewInsights: insights?.payload ?? null,
        // Bild-/A+/Produktinfo-Text (D252): ein Pain Point, den die Status-quo-Bilder
        // beantworten, gilt als adressiert und wird nicht als Maßnahme gefordert.
        bildBelege: snapshotBildBelege(snapshot),
      })
    : null;
  // Varianten-Child (D259): Content wird NICHT pro Child erzeugt. Sinn der Familie
  // ist gleicher Content über alle Varianten — er entsteht EINMAL auf dem Parent
  // und wird von dort übertragen. Ein Child hat daher keine Generier-Oberfläche.
  const istVariantenChild = !!product.parentProductId;
  // Wirksamer Content-Plan (D257): null/leer ⇒ alle Sektionen.
  const planAktiv = wirksamerPlan(product.contentPlan);
  const sektionSoll = { title: wirksam.title, bullets: wirksam.bullets.join(" "), description: wirksam.description };

  // Wirksame Werk-Auswahl (D270): null ⇒ nur Listing-Texte.
  const werkeAktiv = wirksameWerke(product.werkePlan);
  const listingGewaehlt = werkeAktiv.includes("listing");
  // Schon erzeugte Listing-Texte bleiben sichtbar, auch wenn das Werk später
  // abgewählt wird — Abwählen heißt „nichts Neues erzeugen", nicht „Arbeit verstecken".
  const hatListingVersionen = SECTIONS.some(({ key }) => Boolean(latestOf(dbTypFuer(key))));

  // Auftragsumfang-Auswahl (D257/D261/D270) — EIN Formular, drei Einsatzorte
  // (hier, Übertragungs-Maske der Familie, Briefings-Reiter): siehe
  // `components/werk-auswahl.tsx`. Die Kette überspringt Abgewähltes, und ein
  // nicht gewähltes Werk wird serverseitig geblockt (GEN-06) — nicht ausgegraut.
  const planAuswahl = (
    <WerkAuswahl productId={product.id} werkePlan={product.werkePlan} contentPlan={product.contentPlan} />
  );

  return (
    <main className="w-full p-8">
      <Link href={backHref} className="text-xs text-neutral-500 hover:underline">← {parentBrand?.kind === "workbench" ? "Listing Optimizer" : "Katalog"}</Link>
      {/* Child → Parent (D245): von einer Varianten-ASIN zurück zur Familie (Content-Reiter,
          wo Baum + Übertragung leben). Bisher gab es keinen Rückweg zum Parent. */}
      {product.parentProductId && (
        <Link href={`/produkte/${product.parentProductId}?tab=content`} className="ml-3 text-xs text-primary-strong hover:underline">↑ zur Variationsfamilie</Link>
      )}
      {/* Familien-Panel NICHT mehr als Überhang über allen Reitern (D245): die
          Struktur (Master ableiten · Slots · Konsistenz · Übertragen auf Childs)
          gehört in den Content-Reiter, direkt unter den Parent-Content. Siehe unten. */}
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
                  {/* Statt der ASIN doppelt (steht schon in der Überschrift): Link aufs Live-Listing (D231). */}
                  {product.asin && (
                    <>
                      <a
                        href={`https://www.amazon.${amazonDomain(product.marketplace)}/dp/${product.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary-strong hover:underline"
                      >
                        auf Amazon öffnen ↗
                      </a>
                      {" · "}
                    </>
                  )}
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
      {bereit && (
        <TabLeiste
          basisHref={`/produkte/${product.id}`}
          tabs={[...TABS]}
          aktiv={tab}
          /* „Content-Verwaltung" ist KEIN Produkt-Reiter mehr (D255, Nutzer): Die
             Content-Verwaltung lebt im linken Hauptmenü — ein zweiter Einstieg hier
             führte in eine Publish-/Soll-Ansicht, die im Produkt-Kontext nicht
             zuzuordnen war. Die Route bleibt, erreichbar über das Menü. */
          extra={[{ href: `/produkte/${product.id}/briefs`, label: "Briefings" }]}
        />
      )}

      <div className="stagger mt-6 space-y-3">
        {bereit && tab === "listing" && (
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
              {/* D234: Original-Texte NICHT sofort ausbreiten — optional per Dropdown. */}
              {(snapshot.title || (snapshot.bullets?.length ?? 0) > 0) && (
                <details>
                  <summary className="cursor-pointer font-medium hover:underline">Original-Listing-Texte anzeigen</summary>
                  {snapshot.title && <p className="mt-1.5 font-medium">{snapshot.title}</p>}
                  {snapshot.bullets && snapshot.bullets.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-muted">{snapshot.bullets.slice(0, 5).map((b, i) => <li key={i}>• {b.slice(0, 140)}{b.length > 140 ? "…" : ""}</li>)}</ul>
                  )}
                </details>
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
            // D216-Nachzug: Größen-Varianten desselben Bilds auch bei Anzeige entdoppeln
            // (heilt Alt-Snapshots vor D216) — entfernt die verpixelten Phantom-Slots 8/9.
            // Erst-Reihenfolge bleibt, echte Slots 1..n behalten ihre Audit-Zuordnung.
            <BildKacheln imageUrls={bereinigeBildUrls(snapshot.imageUrls)} bilder={snapshot.bilderText ?? []} />
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
          {analysis && <ListingKontrolle analysis={analysis} deepAudit={deepAudit ?? null} quellen={sektionsQuellen} original={snapshot ?? null} sektionSoll={sektionSoll} />}
        </section>
        )}
        {/* Maßnahmen gehighlightet unten im Übersichtsreiter (D172) */}
        {bereit && tab === "listing" && analysis && <MassnahmenBlock analysis={analysis} deepAudit={deepAudit ?? null} />}


        {/* Keywords: in der Start-Phase der Prüf-Schritt vor dem Lauf (D172),
            danach Teil des gebündelten Analyse-Reiters */}
        {(!bereit || tab === "analyse") && (
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
              // Fremdmarken-Kennzeichnung (Nutzer-Befund 23.07., „mammaly", D190):
              // Eine Umsatzlücke auf einem Marken-Keyword ist REAL, darf aber nie
              // in den Listing-Text (Amazon-Policy) — sie ist ein Werbe-Hebel (PPC).
              // Ohne Kennzeichnung widersprechen sich Audit-Box und Aussortierten-Liste.
              const ausgeschlossen = new Map(
                kws.filter((k) => k.ausgeschlossen).map((k) => [k.keyword.toLowerCase().trim(), k.ausschlussGrund ?? ""] as const),
              );
              return (
                <div className="mt-3 rounded-xl border border-hair p-3">
                  <h3 className="text-xs font-semibold">SOV-Audit — {audit.quickWins.length} Quick Wins · {audit.topDemandGaps.length} Top-Umsatzlücken</h3>
                  <ul className="mt-2 space-y-0.5">
                    {audit.topDemandGaps.slice(0, 5).map((g) => {
                      const grund = ausgeschlossen.get(g.keyword.toLowerCase().trim());
                      return (
                        <li key={g.keyword} className="flex items-baseline justify-between gap-2 text-xs">
                          <span>
                            {g.keyword}
                            {grund !== undefined && (
                              <span className="ml-1.5 rounded-full bg-[rgb(217_119_6/0.12)] px-1.5 py-0.5 text-[10px] text-warn">
                                {grund.toLowerCase().startsWith("marke") ? `${grund} — nur Werbung (PPC), nie Listing-Text` : `aussortiert: ${grund}`}
                              </span>
                            )}
                          </span>
                          <span className="flex-none tabular-nums text-muted">{g.sv ? `${fmt(g.sv)} SV` : ""}</span>
                        </li>
                      );
                    })}
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
                    {/* ALLE aktiven Chips sichtbar + abwählbar (Nutzer 23.07., D190) — kein „+N"-Abschneiden: Kuratieren braucht die volle Liste. */}
                    {inTier.map((k) => (
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

        {/* Start-Phase (D172/D219): optionale Produktbeschreibung + EIN Klick für den ganzen Lauf */}
        {!bereit && (
        <section className="card p-5">
          <CardHead icon={<IconSparkle />} chip="chip-violet" title="Analyse & Content" />
          <details className="mt-3" open>
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
              Optionale Produktbeschreibung ({product.zusatzKontext?.trim() ? `${product.zusatzKontext.trim().length} Zeichen hinterlegt` : "leer"})
            </summary>
            <form action={saveZusatzKontext} className="mt-2">
              <input type="hidden" name="productId" value={product.id} />
              <textarea
                name="zusatzKontext"
                rows={5}
                defaultValue={product.zusatzKontext ?? ""}
                placeholder={"Die Produktbeschreibung, die sich nicht scrapen lässt (z. B. der Text, den A+-Inhalte auf der Detailseite ersetzt haben) — plus Fakten, die nirgends stehen.\nFließt in die Analyse UND in jede Texterstellung ein."}
                className={`${input} w-full`}
              />
              <SubmitButton className="mt-2 btn-dark text-xs">Produktbeschreibung speichern</SubmitButton>
            </form>
          </details>
          {/* D270/D257: Der Ein-Klick-Lauf textet nur, was beauftragt ist — die
              Maske erbt Werk- und Sektions-Auswahl statt eine zweite zu führen. */}
          <AnalyseStart
            productId={product.id}
            mainAsin={product.asin}
            vergleichsAsins={vergleichsAsins}
            listingGewaehlt={listingGewaehlt}
            geplanteSektionen={planAktiv}
          />
        </section>
        )}

        {bereit && tab === "analyse" && (<>
        <section id="reviews" className="card p-5">
          <CardHead
            icon={<IconReviews />}
            chip="chip-violet"
            title="Bewertungen"
            right={insights ? <span className="pill pill-good">✓ analysiert · {insights.confidence}</span> : undefined}
          />

          {/* EIN Weg zum Aktualisieren (D177): derselbe Etappen-Lauf wie beim Start,
              nur ohne Content — hält auch Blocker, Features und KI-Bewertung frisch */}
          <AnalyseStart productId={product.id} mainAsin={product.asin} nurAnalyse vergleichsAsins={vergleichsAsins} />
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
                </form>
              )}
            </div>
            );
          })()}
        </section>
        {insights && <BewertungsDashboard insight={insights} scrape={scrape ?? null} productId={product.id} productAsin={product.asin} />}
        </>)}

        {/* Conversion Driver & Blocker (D265): EIN Modell, zwei Projektionen —
            jeder Blocker trägt seine Driver-ID. Ersetzt die beiden getrennten
            Listen unten, sobald ein Lauf vorliegt. */}
        {/* Insights-Dokument (D267): herunterladbar UND als Link für den Kunden —
            dieselbe Seite ist der Ausdruck, kein zweites Layout. */}
        {driverLauf && tab === "analyse" && (() => {
          const h = headersListe;
          const basisUrl = `${h.proto}://${h.host}`;
          const neuester = insightsReports[0] ?? null;
          const veraltet = neuester ? neuester.createdAt < driverLauf.createdAt : false;
          return (
            <section className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Insights-Dokument für den Kunden</h2>
                {neuester && <span className="text-[11px] text-muted">Version {neuester.version} · {neuester.createdAt.toLocaleDateString("de-DE")}</span>}
              </div>
              <p className="mt-1 text-xs text-muted">
                Vier Seiten aus dieser Analyse — Kaufgründe, Abdeckung, Handlungsplan, Grenzen. Eingefroren: der Link
                zeigt immer denselben Stand. „Als PDF speichern“ steckt in der Seite selbst.
              </p>
              {neuester && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-hair p-3">
                  <a href={`/insights/${neuester.token}`} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs">
                    Dokument öffnen ↗
                  </a>
                  <CopyLink url={`${basisUrl}/insights/${neuester.token}`} className="btn-ghost text-xs" />
                  <span className="font-mono text-[11px] text-muted">/insights/{neuester.token.slice(0, 12)}…</span>
                  {veraltet && (
                    <span className="pill pill-warn">Analyse ist neuer als dieses Dokument — neue Version erzeugen</span>
                  )}
                </div>
              )}
              <form action={erzeugeInsightsDokument} className="mt-3">
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton className={neuester ? "btn-dark text-xs" : "btn-primary text-xs"} pendingLabel="Baut Dokument…">
                  {neuester ? "Neue Version erzeugen" : "Dokument erzeugen"}
                </SubmitButton>
              </form>
              {insightsReports.length > 1 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                    Frühere Versionen ({insightsReports.length - 1})
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {insightsReports.slice(1).map((r) => (
                      <li key={r.id} className="flex items-baseline gap-2 text-[11px]">
                        <span className="text-muted">Version {r.version} · {r.createdAt.toLocaleDateString("de-DE")}</span>
                        <a href={`/insights/${r.token}`} target="_blank" rel="noopener noreferrer" className="text-primary-strong hover:underline">öffnen ↗</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })()}

        {driverLauf && tab === "analyse" && (
          <DriverBlock
            lauf={driverLauf}
            /* Karten mit negativer/ausgeglichener Tendenz waren seit D243 in
               keinem Reiter sichtbar (D266) — sie sind kein Kaufgrund, sondern
               Erwartungs-Management, und gehören in den Risiko-Block. */
            risiken={(insights ? normalisierePayload(insights.payload).insightCards ?? [] : []).filter(
              (k) => kartenKlasse(k) !== "positiv",
            )}
          />
        )}

        {/* Alt-Ansicht (D178) — nur solange für dieses Produkt kein Driver-Lauf
            existiert. Beides gleichzeitig wäre genau die Doppelung, die D265
            abstellt. */}
        {!driverLauf && insights && tab === "analyse" && (() => {
          const treiber = (normalisierePayload(insights.payload).insightCards ?? []).filter((k) => kartenKlasse(k) === "positiv");
          if (treiber.length === 0) return null;
          return (
            <section className="card p-5">
              <CardHead icon={<IconCheck />} chip="chip-teal" title="Conversion Drivers" />
              <div className="mt-4 space-y-2">
                {treiber.map((k, i) => (
                  <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={normalisierePayload(insights.payload).stats.reviewsTotal} />
                ))}
              </div>
            </section>
          );
        })()}

        {!driverLauf && bereit && tab === "analyse" && (
        <section className="card p-5">
          <CardHead
            icon={<IconSichtbarkeit />}
            chip="chip-amber"
            title="Conversion-Blocker"
          />
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
            </>
          )}
        </section>
        )}

        {/* Restliches Hintergrundwissen (D172): Zielgruppe/USPs, Sterne-Gruppen, SOV, Feature-Ranking, Stärken & Schwächen */}
        {bereit && tab === "analyse" && analysis && (
          <AnalyseHintergrund
            analysis={analysis}
            deepAudit={deepAudit ?? null}
            featureRanking={featureRanking ?? null}
          />
        )}

        {/* Familien-Kontext GANZ OBEN im Content-Bereich (D256) — auf Parent UND Child,
            damit immer sichtbar ist, in welcher Variantenstruktur man sich befindet.
            Parent: der Manager (seine Tabelle IST die Struktur + Verwaltung) — keine
            doppelte Tabelle. Child: die rein lesende Struktur-Tabelle. */}
        {bereit && tab === "content" && familie && (
          <div className="mb-4">
            <FamilieStruktur familie={familie} aktuellId={product.id} />
          </div>
        )}

        {/* Varianten-Child (D259): KEINE eigene Generier-Oberfläche. Der Content der
            Familie entsteht einmal auf dem Parent und wird übertragen — pro Child
            einzeln zu generieren würde die Gleichheit über die Varianten zerstören.
            Hier daher nur der übertragene Stand, lesend und eingeklappt. */}
        {bereit && tab === "content" && istVariantenChild && (
          <section className="card p-5">
            <CardHead icon={<IconContent />} chip="chip-teal" title="Content dieser Variante" />
            <p className="mt-2 text-xs text-muted">
              Der Content der Familie wird auf der Parent-ASIN erzeugt und von dort übertragen — so bleibt er über alle
              Varianten gleich (bis auf die Varianten-Unterschiede).{" "}
              {product.parentProductId && (
                <Link href={`/produkte/${product.parentProductId}?tab=content`} className="text-primary-strong underline">
                  Zum Content der Parent-ASIN →
                </Link>
              )}
            </p>
            <div className="mt-3 space-y-2">
              {planAktiv.map((key) => {
                const v = latestOf(dbTypFuer(key));
                const p2 = v?.payload as { text?: string; items?: string[]; pairs?: Array<{ q: string; a: string }> } | undefined;
                const text = p2?.items ? p2.items.join("\n") : p2?.pairs ? p2.pairs.map((x) => `${x.q} → ${x.a}`).join("\n") : p2?.text ?? "";
                return (
                  <details key={key} className="rounded-xl border border-hair p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {SEKTIONS_LABEL[key]}{" "}
                      {v ? (
                        v.status === "approved"
                          ? <span className="ml-1 pill pill-good">✓ freigegeben</span>
                          : <span className="ml-1 pill pill-neutral">Entwurf v{v.version}</span>
                      ) : (
                        <span className="ml-1 pill pill-neutral">noch nicht übertragen</span>
                      )}
                    </summary>
                    {text ? (
                      <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground/80">{text}</pre>
                    ) : (
                      <p className="mt-2 text-xs text-muted">Noch kein Inhalt — auf dem Parent erzeugen und übertragen.</p>
                    )}
                    {v?.validation?.issues?.length ? <IssueList issues={v.validation.issues} /> : null}
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {bereit && tab === "content" && !istVariantenChild && (
        <section className="card p-5">
          <CardHead
            icon={<IconContent />}
            chip="chip-teal"
            title="Content"
          />
          {/* Optionale Produktbeschreibung (D108/D219): fließt in JEDE Generierung UND in die Analyse ein */}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
              Optionale Produktbeschreibung ({product.zusatzKontext?.trim() ? `${product.zusatzKontext.trim().length} Zeichen hinterlegt` : "leer"})
            </summary>
            <form action={saveZusatzKontext} className="mt-2">
              <input type="hidden" name="productId" value={product.id} />
              <textarea
                name="zusatzKontext"
                rows={5}
                defaultValue={product.zusatzKontext ?? ""}
                placeholder={"Die Produktbeschreibung, die sich nicht scrapen lässt (z. B. der Text, den A+-Inhalte auf der Detailseite ersetzt haben) — plus Fakten, die nirgends stehen.\nFließt in die Analyse UND in jede Texterstellung ein."}
                className={`${input} w-full`}
              />
              <SubmitButton className="mt-2 btn-dark text-xs">Produktbeschreibung speichern</SubmitButton>
            </form>
          </details>
          {/* Plan-Auswahl steht bei Varianten-Familien in der Übertragungs-Maske
              unten (D261) — dort wird der Content für ALLE Varianten festgelegt.
              Nur ohne Familie (Einzel-ASIN) gehört sie hierher. */}
          {!familiePanel && planAuswahl}
          {/* Werk abgewählt (D270): keine Generier-Oberfläche. Vorhandene Texte
              bleiben unten sichtbar — Abwählen stoppt neue Arbeit, versteckt aber
              keine geleistete. */}
          {!listingGewaehlt && (
            <p className="mt-3 rounded-xl border border-hair px-3 py-2 text-xs text-muted">
              „{WERK_LABEL.listing}“ sind für dieses Produkt nicht ausgewählt — es wird nichts generiert.
              {hatListingVersionen
                ? " Bereits erzeugte Texte stehen unten."
                : " Oben anhaken, speichern, dann erzeugen."}
            </p>
          )}
          {/* Geführte Kette (D195): Sektion generieren → bearbeiten/freigeben →
              die Freigabe generiert automatisch die nächste GEPLANTE. Nach der
              Freigabe gibt es bewusst KEINE Einzel-Regenerierung mehr (die
              Sektionen bauen aufeinander auf) — nur Neu-aufsetzen für alle. */}
          {(listingGewaehlt || hatListingVersionen) && (
          <GenerierSperre>
          {listingGewaehlt && SECTIONS.some(({ key }) => {
            const t = key === "backend" ? "backend_keywords" : key === "highlights" ? "item_highlights" : key;
            return latestOf(t)?.status === "approved";
          }) && (
            <form action={resetContentChain} className="mt-3">
              <input type="hidden" name="productId" value={product.id} />
              <SubmitButton className="btn-ghost text-xs">Alle Texte neu aufsetzen — Freigaben zurückziehen, Kette startet beim Titel</SubmitButton>
            </form>
          )}
          <div className="mt-4 space-y-3">
            {/* Werk gewählt → der Plan bestimmt die Liste. Werk abgewählt (D270) →
                nur noch das, was wirklich existiert (Archiv-Ansicht, keine Auftragsliste). */}
            {SECTIONS.filter(({ key }) =>
              listingGewaehlt ? planAktiv.includes(key) : Boolean(latestOf(dbTypFuer(key))),
            ).map(({ key, label }) => {
              const dbType = dbTypFuer(key);
              const v = latestOf(dbType);
              // Ketten-Status (D257): nur GEPLANTE Vorgänger blockieren — eine
              // abgewählte Sektion darf nie als „wartet auf Freigabe" erscheinen.
              const wartetAufKey = geplanteVorgaenger(product.contentPlan, key).find(
                (vk) => latestOf(dbTypFuer(vk))?.status !== "approved",
              );
              const wartetAuf = wartetAufKey ? { label: SEKTIONS_LABEL[wartetAufKey] } : undefined;
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
                      {/* Geführte Kette (D195): Warten auf Vorgänger → Hinweis statt Knopf;
                          Entwurf → Freigeben (löst die nächste Sektion aus) + Neu generieren;
                          freigegeben → keine Einzel-Regenerierung mehr (nur manuell bearbeiten). */}
                      {!listingGewaehlt ? (
                        /* D270: Werk abgewählt — kein Generieren, kein Freigeben.
                           Der Text bleibt lesbar, die Kette bleibt stehen. */
                        <span className="pill pill-neutral">Werk nicht ausgewählt</span>
                      ) : wartetAuf ? (
                        <span className="pill pill-neutral">wartet auf Freigabe: {wartetAuf.label}</span>
                      ) : v?.status === "approved" ? null : (
                        <>
                          {v && v.status === "draft" && (v.validation?.passed ?? true) && (
                            <form action={approveContent}>
                              <input type="hidden" name="productId" value={product.id} />
                              <input type="hidden" name="versionId" value={v.id} />
                              <SubmitButton className="btn-ghost px-3 py-1 text-xs !text-good" pendingLabel={key === "qa" ? "Gibt frei…" : "Gibt frei & generiert die nächste Sektion…"} progress>✓ Freigeben</SubmitButton>
                            </form>
                          )}
                          <form action={generateContent}>
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="section" value={key} />
                            <GenerierButton>{v ? "Neu generieren" : "Generieren"}</GenerierButton>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Bausteine standardmäßig EINGEKLAPPT (D260, Nutzer): Wer schon Content
                      hat, will nicht mit Text erschlagen werden — je Baustein eine Zeile,
                      die man aufklappt. Ohne Inhalt ist der Block offen (nichts zu verbergen). */}
                  <details open={!v} className="mt-1">
                    <summary className="cursor-pointer text-xs text-primary-strong hover:underline">
                      {v ? "Text anzeigen" : "Details"}
                    </summary>
                    <div className="mt-1">
                  {/* Graceful Degradation (D202): ein Entwurf mit passed=false hat
                      das QM-Gate nach allen Versuchen NICHT bestanden — klar markiert,
                      nicht freigabefähig, die offenen Punkte stehen rot unten. */}
                  {/* D232: keine alarmierende „Gate nicht bestanden"-Meldung mehr — nur ein
                      sachlicher Hinweis zum Kürzen/Bearbeiten. Die offenen Punkte stehen unten. */}
                  {v?.status === "draft" && v.validation && v.validation.passed === false && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                      Bitte Text bearbeiten — die offenen Punkte stehen unten.
                    </p>
                  )}
                  {/* Kopierbare Einzel-Felder (D175): Klick kopiert; Zeichen-Hinweis
                      neutral, rot NUR über dem harten Amazon-Maximum */}
                  {payload?.text && (
                    <div className="mt-2">
                      <KopierFeld
                        text={payload.text}
                        max={key === "title" ? 75 : key === "highlights" ? 125 : key === "backend" ? 250 : undefined}
                        bytes={key === "backend"}
                        mono={key === "backend"}
                      />
                    </div>
                  )}
                  {payload?.pairs && (
                    <div className="mt-2 space-y-1.5">
                      {payload.pairs.map((p, i) => (
                        <KopierFeld key={i} label={`Frage ${i + 1}`} text={`${p.q}\n${p.a}`} />
                      ))}
                    </div>
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
                    <div className="mt-2 space-y-1.5">
                      {payload.items.map((b, i) => (
                        <KopierFeld key={i} label={`Bullet ${i + 1}`} text={b} />
                      ))}
                    </div>
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
                  </details>
                </div>
              );
            })}
          </div>
          </GenerierSperre>
          )}
        </section>
        )}

        {/* Varianten-Baum + Master (D260): UNTER dem eigenen Content. Reihenfolge auf der
            Parent-Content-Seite: Kopfkarte → Familien-Tabelle → eigener Content (aufklappbar)
            → „Base festlegen und auf alle Childs anwenden". */}
        {bereit && tab === "content" && familiePanel && (
          <section className="card mt-4 p-5">
            {/* D261: HIER wird festgelegt, welche Bausteine die Familie bekommt — die
                Übertragung ist der Ort der Entscheidung, nicht jede einzelne ASIN. */}
            {planAuswahl}
            <div className="mt-4">
              <FamilieManager familie={familiePanel} />
            </div>
          </section>
        )}

        {bereit && tab === "marge" && (
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
