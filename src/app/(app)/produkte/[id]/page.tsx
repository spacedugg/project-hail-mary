import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { saveFacts, saveKeywords, deriveKeywordsFromSov, generateContent, uploadCerebro, scrapeReviewsAction, analyzeReviewsAction, importListingFromAmazon, uploadListingCsv, saveContentManual, approveContent, saveMarginCalc } from "@/app/actions";
import type { ValidationIssue } from "@/db/schema";
import { AMAZON_CATEGORIES } from "@/lib/margin/fees";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";
// Apify-Scrapes & LLM-Generierung brauchen mehr als das Vercel-Default-Zeitbudget
export const maxDuration = 60;

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

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { id } = await params;
  const { fehler } = await searchParams;
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
  const fmtEur = (n: number) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
  const fmtPct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} %`;

  const parentBrand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const backHref = parentBrand?.kind === "workbench" ? "/optimizer" : `/marke/${product.brandId}/katalog`;

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
              <Link href={`/produkte/${product.id}/analyse`} className="btn-ghost !text-primary-strong font-medium">Analyse öffnen →</Link>
            </>
          ) : (
            <span className="text-xs text-muted">Analyse & Briefs werden aktiv, sobald ein Listing geladen oder Content erstellt ist.</span>
          )}
        </div>
      </div>

      {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad">✕ {fehler}</p>}

      {/* 0 · Original-Listing laden */}
      <section className="mt-6 card p-4">
        <h2 className="sect-h">
          0 · Original-Listing laden {snapshot && <span className="ml-1 pill pill-good">✓ {snapshot.source} · {snapshot.createdAt.toLocaleDateString("de-DE")}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">ASIN reicht: Titel, Bullets, Beschreibung und Bilder werden geladen und die Produkt-Fakten unten automatisch daraus befüllt — als „Vorher" für Analyse & Vergleich. Alternativ Helium-10-Export hochladen.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={importListingFromAmazon}>
            <input type="hidden" name="productId" value={product.id} />
            <SubmitButton disabled={!product.asin} className="btn-dark disabled:opacity-40" pendingLabel="Lädt Listing & extrahiert Fakten…" progress>
              Listing von Amazon laden
            </SubmitButton>
          </form>
          <form action={uploadListingCsv} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <input type="file" name="file" accept=".csv" required className="text-sm" />
            <SubmitButton className="btn-ghost">H10-CSV importieren</SubmitButton>
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
        <h2 className="sect-h">1 · Produkt-Fakten — die Grundlage für Texte & Briefs</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Wird beim Listing-Import automatisch befüllt (nur leere Felder) — hier nur prüfen und korrigieren.
          Diese Fakten sind die einzige Wahrheitsquelle der Generierung: Materialien/Maße gegen Erfindungen (Reference-Fidelity),
          USPs für die Bullet-Verteilung (jede genau 1×), Zielgruppe für Szenen im Bild-Brief und die Ansprache der Texte.
        </p>
        <form action={saveFacts} className="mt-3 grid grid-cols-2 gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <input name="productType" defaultValue={f.productType} placeholder="Produkttyp (z. B. Trinkflasche)" className={input} />
          <input name="dimensions" defaultValue={f.dimensions} placeholder="Maße/Menge (z. B. 750 ml)" className={input} />
          <input name="materials" defaultValue={f.materials?.join(" | ")} placeholder="Materialien, ehrlich, | -getrennt" className={`${input} col-span-2`} />
          <input name="usps" defaultValue={f.usps?.join(" | ")} placeholder="USPs (| -getrennt) — jede wird genau 1× verwendet" className={`${input} col-span-2`} />
          <input name="targetAudience" defaultValue={f.targetAudience} placeholder="Zielgruppe/Nutzungskontext — steuert Bild-Brief-Szenen & Text-Ansprache" className={input} />
          <input name="certifications" defaultValue={f.certifications?.join(" | ")} placeholder="Zertifikate/Normen (nur echte)" className={input} />
          <SubmitButton className="col-span-2 btn-dark">
            Speichern
          </SubmitButton>
        </form>
      </section>

      {/* 2 · Keywords */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">
          2 · Keyword-Basis (Pflicht) — {kws.length} Keywords
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Tiering: 1–3 primary → Titel, 4–13 secondary → Bullets/Highlights, 14–18 tertiary → Beschreibung, Rest → Backend.
          Beste Quelle ist die Herleitung aus dem SOV-Audit (Suchvolumen × Relevanz); manuelle Keywords ergänzen sie.
        </p>
        {sovUpload && (
          <form action={deriveKeywordsFromSov} className="mt-3">
            <input type="hidden" name="productId" value={product.id} />
            <SubmitButton className="btn-primary">
              Aus SOV-Audit ableiten ({kws.filter((k) => k.source === "cerebro").length ? "aktualisieren" : "Cerebro-Daten nutzen"})
            </SubmitButton>
          </form>
        )}
        {(["primary", "secondary", "tertiary", "backend"] as const).map((tier) => {
          const inTier = kws.filter((k) => k.tier === tier && k.source !== "manual");
          if (inTier.length === 0) return null;
          return (
            <div key={tier} className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">{tier} · {inTier.length}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {inTier.slice(0, 24).map((k) => (
                  <span key={k.id} className="tag">{k.keyword}{k.searchVolume ? ` · ${new Intl.NumberFormat("de-DE").format(k.searchVolume)}` : ""}</span>
                ))}
                {inTier.length > 24 && <span className="text-[10px] text-neutral-400">… +{inTier.length - 24}</span>}
              </div>
            </div>
          );
        })}
        <details className="mt-3" open={kws.every((k) => k.source === "manual")}>
          <summary className="cursor-pointer text-xs text-neutral-500">
            Manuelle Keywords ({kws.filter((k) => k.source === "manual").length}) — eine Zeile je Keyword, optional „;Suchvolumen"
          </summary>
          <form action={saveKeywords} className="mt-2">
            <input type="hidden" name="productId" value={product.id} />
            <textarea
              name="keywords"
              rows={6}
              defaultValue={kws.filter((k) => k.source === "manual").map((k) => `${k.keyword}${k.searchVolume ? `;${k.searchVolume}` : ""}`).join("\n")}
              placeholder={"edelstahl trinkflasche;18100\nthermosflasche;9900\n…"}
              className={`${input} font-mono`}
            />
            <SubmitButton className="mt-2 btn-dark">
              Keywords speichern
            </SubmitButton>
          </form>
        </details>
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
          <SubmitButton className="btn-dark" pendingLabel="Wertet aus…">Hochladen & auswerten</SubmitButton>
        </form>
        {uploads.find((u) => u.reportType === "cerebro" && u.parseStatus === "error") && !sovUpload && (
          <p className="mt-2 text-xs text-red-600">Letzter Upload fehlgeschlagen: {uploads.find((u) => u.parseStatus === "error")?.parseError}</p>
        )}
      </section>

      {/* 2c · Review-Insights */}
      <section id="reviews" className="mt-4 card p-4">
        <h2 className="sect-h">
          2c · Bewertungs-Analyse {insights && <span className="ml-1 pill pill-good">✓ analysiert · {insights.confidence}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Zwei Schritte: <b>1.</b> Reviews <b>dieser ASIN</b>{product.asin ? <> (<span className="font-mono">{product.asin}</span>)</> : " — dafür oben eine ASIN hinterlegen"} scrapen
          (optional Wettbewerber dazu) — je Sterne-Klasse ein eigener Lauf mit bis zu 100 der aktuellsten Reviews, die Datenbasis erscheint als Sterne-Verteilung. <b>2.</b> Analyse auslösen → Findings-Dashboard.
        </p>

        {/* Schritt 1 · Scrape */}
        <form action={scrapeReviewsAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <input name="competitorAsins" placeholder="Optional: Wettbewerber-ASINs (Leerzeichen-getrennt)" className={`${input} flex-1`} />
          <SubmitButton className="btn-dark" disabled={!product.asin} pendingLabel="Scrapt Reviews…" progress>
            {scrape ? "Neu scrapen" : "1 · Reviews scrapen"}
          </SubmitButton>
        </form>

        {/* Datenbasis: Sterne-Verteilung + je ASIN */}
        {scrape && (
          <div className="mt-3 rounded-xl bg-background p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">
                Datenbasis: {scrape.reviews.length} Reviews · {scrape.createdAt.toLocaleDateString("de-DE")}
                {scrape.source !== "apify" && <span className="ml-1 pill pill-warn">Demo-Daten (kein Scrape-Key)</span>}
              </span>
              <span className="text-[11px] text-muted">{Object.entries(scrape.perAsin).map(([a, n]) => `${a}: ${n}`).join(" · ")}</span>
            </div>
            <div className="mt-2 space-y-1">
              {(["5", "4", "3", "2", "1"] as const).map((star) => {
                const n = scrape.starCounts[star] ?? 0;
                const max = Math.max(...Object.values(scrape.starCounts), 1);
                return (
                  <div key={star} className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="w-8 flex-none text-muted">{star} ★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-hair">
                      <div className="bar-fill h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: Number(star) >= 4 ? "var(--cat-2)" : Number(star) === 3 ? "var(--warn)" : "var(--bad)" }} />
                    </div>
                    <span className="w-10 flex-none text-right font-medium">{n}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">Je Sterne-Klasse werden bis zu 100 der aktuellsten Reviews geholt (Scrape-Maximum). 1–3 ★ speisen die Pain Points, 4–5 ★ die Kaufauslöser der Analyse.</p>
            {(scrape.notes?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-0.5">
                {scrape.notes!.map((n, i) => (
                  <p key={i} className="text-[11px] text-warn">△ {n}</p>
                ))}
              </div>
            )}

            {/* Schritt 2 · Analyse */}
            <form action={analyzeReviewsAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <SubmitButton className="btn-primary" pendingLabel="KI wertet Pain Points & Kaufauslöser aus…" progress>
                2 · Analyse starten
              </SubmitButton>
              {insights && (
                <Link href={`/produkte/${product.id}/reviews`} className="btn-ghost !text-primary-strong text-xs">
                  Findings-Dashboard öffnen →
                </Link>
              )}
            </form>
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
                      <SubmitButton className="btn-primary px-3 py-1 text-xs">
                        {v ? "Neu generieren" : "Generieren"}
                      </SubmitButton>
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
                    <SubmitButton className="btn-dark mt-1.5 text-xs">
                      Speichern als neue Version (v{(v?.version ?? 0) + 1})
                    </SubmitButton>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 · Marge & Break-even (reporting-main-Port; Hybrid: Auto-Defaults, alles überschreibbar) */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">
          4 · Marge & Break-even {mc && <span className="ml-1 pill pill-good">✓ {fmtPct(mc.results.marginPct)} Marge · BEP-ACoS {fmtPct(mc.results.breakEvenAcos)}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Gebühren nach Amazon.de-Tabellen (Verkaufsgebühr je Kategorie, Lager 2 Monate pauschal, Retouren/Entsorgung nach Workbook-Formeln).
          Der Break-even-ACoS speist die ACoS/TACoS-Ampel, wenn keine Account-Marge gesetzt ist.
          {" "}Formeln & Tabellen einsehen/aktualisieren: <Link href="/rechenwerk" className="text-primary-strong underline">Rechenwerk</Link>.
        </p>
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
          <div className="col-span-2 flex items-end sm:col-span-2">
            <SubmitButton className="btn-primary">Berechnen & speichern</SubmitButton>
          </div>
        </form>
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
      </section>
    </main>
  );
}
