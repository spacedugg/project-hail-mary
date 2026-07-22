import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { analyzeListing, deckungsgrad, wirksamesListing, type SektionsQuelle } from "@/lib/analysis/listingAudit";
import { runDeepAuditAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";
import type { SovAudit } from "@/lib/sov/audit";
import type { DeepAuditDimension } from "@/db/schema";
import { befundKarten, massnahmenKarten } from "@/lib/analysis/auditKarten";
import { InsightKarte } from "@/components/insight-karte";

export const dynamic = "force-dynamic";
// Tiefen-Audit (LLM): sonnet-5 denkt adaptiv und braucht bei großen Prompts
// teils Minuten (D118). 300 s Budget; der LLM-Abbruch liegt bei 270 s.
export const maxDuration = 300;

/**
 * Produkt-Analyse — EINE Fläche (D126, Nutzer-Vorgabe 21.07.): kein separater
 * Tiefen-Audit-Layer mehr. Zielgruppe/Positionierung/USPs prominent, je
 * Sektion Richtlinien-Score + KI-Befund + Live-Abgleich in EINER Karte,
 * Sterne-Verteilung als Kreisdiagramm, Pain Points vs. Kaufauslöser nach
 * Erwähnungs-Häufigkeit. Jede Dimension weist ihre Evidenz-Klasse aus.
 */

// Kreisdiagramm (SVG, druckfähig): Sterne-Verteilung — Status-Farben, 2px Lücken
function SterneDonut({ dist, avg, total }: { dist: Record<string, number>; avg: number | null; total: number | null }) {
  const farben: Record<string, string> = { "5": "#059669", "4": "#34d399", "3": "#f59e0b", "2": "#f97316", "1": "#dc2626" };
  const r = 42;
  const umfang = 2 * Math.PI * r;
  let offset = 0;
  const segmente = ["5", "4", "3", "2", "1"]
    .map((s) => ({ s, pct: Math.max(0, dist[s] ?? 0) }))
    .filter((x) => x.pct > 0);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-32 w-32 flex-none" role="img" aria-label="Sterne-Verteilung">
        {segmente.map(({ s, pct }) => {
          const laenge = (pct / 100) * umfang;
          const el = (
            <circle key={s} cx="60" cy="60" r={r} fill="none" stroke={farben[s]} strokeWidth="14"
              strokeDasharray={`${Math.max(0, laenge - 2)} ${umfang - Math.max(0, laenge - 2)}`}
              strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          );
          offset += laenge;
          return el;
        })}
        <text x="60" y="57" textAnchor="middle" className="fill-current" fontSize="17" fontWeight="700">{avg !== null ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(avg)} ★` : "–"}</text>
        <text x="60" y="72" textAnchor="middle" className="fill-current" fontSize="8" opacity="0.6">{total !== null ? `${new Intl.NumberFormat("de-DE").format(total)} Bew.` : ""}</text>
      </svg>
      <ul className="space-y-0.5 text-xs">
        {["5", "4", "3", "2", "1"].map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: farben[s] }} />
            <span className="w-6">{s} ★</span>
            <span className="tabular-nums text-muted">{dist[s] ?? 0} %</span>
          </li>
        ))}
        <li className="pt-1 text-[10px] text-muted">negativ = 1–2 ★ · neutral = 3 ★ · positiv = 4–5 ★</li>
      </ul>
    </div>
  );
}

// Erwähnungs-Vergleich: Pain Points vs. Kaufauslöser, sortiert nach Häufigkeit
function HaeufigkeitsBalken({ titel, farbe, eintraege }: { titel: string; farbe: string; eintraege: Array<{ label: string; pct: number | null }> }) {
  const max = Math.max(10, ...eintraege.map((e) => e.pct ?? 0));
  return (
    <div>
      <h4 className="text-xs font-semibold">{titel}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {eintraege.map((e, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate" title={e.label}>{e.label}</span>
              <span className="flex-none tabular-nums text-muted">{e.pct !== null ? `${e.pct} %` : "–"}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-hair">
              <div className={`h-full rounded-full ${farbe}`} style={{ width: `${((e.pct ?? 0) / max) * 100}%` }} />
            </div>
          </li>
        ))}
        {eintraege.length === 0 && <li className="text-xs text-muted">— keine erfasst —</li>}
      </ul>
    </div>
  );
}

export default async function AnalysePage({
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
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });

  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, id),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const original = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, id),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  // Mess-Stand (D110): FREIGEGEBENE Texte, sonst Original-Listing — Entwürfe
  // zählen nicht (deren Prüfung läuft im Optimizer). Quelle je Sektion sichtbar.
  const { snapshot, quellen } = wirksamesListing(versions, original ?? null);
  const deepAudit = await db.query.deepAudits.findFirst({
    where: eq(schema.deepAudits.productId, id),
    orderBy: desc(schema.deepAudits.createdAt),
  });
  const lastScrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, id),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });

  const kws = (await db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) })).filter((k) => !k.ausgeschlossen);
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
  const sovAudit = (sovUpload?.parsed as { audit?: SovAudit })?.audit ?? null;

  const analysis = analyzeListing({
    snapshot,
    facts: product.facts,
    primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
    sovAudit,
    reviewInsights: insights?.payload ?? null,
  });

  const scoreColor = analysis.overall === null ? "text-muted" : analysis.overall >= 80 ? "text-emerald-600" : analysis.overall >= 60 ? "text-amber-600" : "text-red-600";
  const measurable = analysis.dimensions.some((d) => d.measured);
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
  const fmt1 = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

  const newestInput = Math.max(
    original?.createdAt.getTime() ?? 0,
    insights?.createdAt.getTime() ?? 0,
    versions[0]?.createdAt.getTime() ?? 0,
    lastScrape?.createdAt.getTime() ?? 0,
    sovUpload?.createdAt.getTime() ?? 0,
  );
  const auditStale = !deepAudit || newestInput > deepAudit.createdAt.getTime();

  const detByKey = Object.fromEntries(analysis.dimensions.map((d) => [d.key, d]));
  const kiByKey: Record<string, DeepAuditDimension> = Object.fromEntries((deepAudit?.payload.dimensions ?? []).map((d) => [d.key, d]));
  const quelleText = (q: SektionsQuelle) =>
    q.basis === "freigegeben" ? `freigegebene v${q.version}` : q.basis === "original" ? `Original-Listing${original ? ` (${original.createdAt.toLocaleDateString("de-DE")})` : ""}` : "fehlt";

  // Live-Abgleich (D126): Ist unser freigegebener Text im letzten Import wiederzufinden?
  const liveBadge = (key: "title" | "bullets" | "description", soll: string) => {
    const q = quellen[key];
    if (q.basis !== "freigegeben") return <span className="pill pill-neutral" title="Es ist kein eigener Text freigegeben — live ist das Original.">Original ist live</span>;
    if (!original) return <span className="pill pill-neutral">kein Import zum Abgleich</span>;
    const ist = key === "title" ? (original.title ?? "") : key === "bullets" ? (original.bullets ?? []).join(" ") : (original.description ?? "");
    const grad = deckungsgrad(soll, ist);
    return grad >= 85 ? (
      <span className="pill pill-good" title={`Freigegebener Text ist im letzten Import (${original.createdAt.toLocaleDateString("de-DE")}) zu ${grad} % wiederzufinden — Kunden ändern beim Einstellen manchmal minimal.`}>✓ live · {grad} % Deckung</span>
    ) : (
      <span className="pill pill-warn" title={`Nur ${grad} % des freigegebenen Texts finden sich im letzten Import (${original.createdAt.toLocaleDateString("de-DE")}) — Text nicht eingestellt oder stark abgeändert. Neu importieren, um den aktuellen Live-Stand zu prüfen.`}>△ weicht live ab · {grad} %</span>
    );
  };

  const sektionSoll: Record<"title" | "bullets" | "description", string> = {
    title: snapshot.title,
    bullets: snapshot.bullets.join(" "),
    description: snapshot.description,
  };
  const textSektionen: Array<{ key: "title" | "bullets" | "description" | "backend"; live: boolean }> = [
    { key: "title", live: true },
    { key: "bullets", live: true },
    { key: "description", live: true },
    { key: "backend", live: false },
  ];
  const labelFuer: Record<string, string> = { title: "Titel", bullets: "Bullet Points", description: "Beschreibung", backend: "Backend-Keywords" };

  const pains = (insights?.payload.painPoints ?? []).slice(0, 5).map((p) => ({ label: p.label, pct: p.frequencyPct }));
  const trigs = (insights?.payload.buyingTriggers ?? []).slice(0, 5).map((t) => ({ label: t.label, pct: t.frequencyPct }));

  return (
    <main className="w-full p-8 print:p-0">
      <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline print:hidden">← Produkt</Link>

      <header className="mt-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <p className="text-xs uppercase tracking-widest text-primary-strong">Produkt-Analyse · {brand?.name}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 className="page-title">{product.name}</h1>
          <div className="text-right">
            {analysis.overall !== null ? (
              <>
                <div className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{analysis.overall}<span className="text-base font-normal text-neutral-400">/100</span></div>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">Gesamt (Ø gemessener Dimensionen)</div>
              </>
            ) : (
              <div className="text-sm font-medium text-muted">Noch keine Messung möglich</div>
            )}
          </div>
        </div>
        {product.asin && <p className="font-mono text-xs text-neutral-500">{product.asin} · amazon.{product.marketplace}</p>}
      </header>

      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}
      {hinweis && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm text-primary-strong print:hidden">ℹ {hinweis}</p>}

      {/* ── Herzstück: Zielgruppe · Positionierung · USPs — prominent (D126) ── */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sect-h">Zielgruppe · Positionierung · USPs {deepAudit && <span className="ml-1 pill pill-good">✓ KI-Bewertung vom {deepAudit.createdAt.toLocaleDateString("de-DE")}</span>}</h2>
          {auditStale ? (
            <form action={runDeepAuditAction} className="print:hidden">
              <input type="hidden" name="productId" value={product.id} />
              <SubmitButton className="btn-primary text-xs" pendingLabel="KI bewertet das Listing…" progress>
                {deepAudit ? "KI-Bewertung aktualisieren (Datenbasis hat sich geändert)" : "KI-Bewertung starten"}
              </SubmitButton>
            </form>
          ) : (
            <span className="pill pill-neutral print:hidden">aktuell — Datenbasis unverändert</span>
          )}
        </div>
        {!deepAudit && (
          <p className="mt-1 text-xs text-muted">
            Die KI-Bewertung leitet Zielgruppe, Positionierung und USPs aus echten Daten her (Listing + Kundenstimmen) und
            liefert je Sektion einen Befund — alles auf DIESER Fläche, kein separater Layer.
            Voraussetzung: Listing geladen <b>und</b> Bewertungs-Analyse gefahren.
            {!insights && <> <span className="text-warn">△ Bewertungs-Analyse fehlt noch (Produktseite, Sektion 2c).</span></>}
          </p>
        )}
        {deepAudit && (
          <div className="stagger mt-2 grid gap-3 lg:grid-cols-3">
            <div className="card border-l-4 border-l-[var(--primary)] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">Zielgruppe (aus Reviews)</h3>
              <p className="mt-2 text-sm font-medium">{deepAudit.payload.derived.zielgruppe || "—"}</p>
            </div>
            <div className="card border-l-4 border-l-[var(--primary)] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">Positionierung</h3>
              <p className="mt-2 text-sm font-medium">{deepAudit.payload.derived.positionierung || "—"}</p>
            </div>
            <div className="card border-l-4 border-l-[var(--primary)] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">USPs (belegbar aus Daten)</h3>
              <ul className="mt-2 space-y-1">
                {deepAudit.payload.derived.usps.map((u, i) => <li key={i} className="text-sm">✓ {u}</li>)}
                {deepAudit.payload.derived.usps.length === 0 && <li className="text-sm text-muted">—</li>}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ── Datenbasis visuell: Sterne-Verteilung + Pain Points vs. Kaufauslöser ── */}
      {(original?.ratingDist || pains.length > 0 || trigs.length > 0) && (
        <section className="mt-6">
          <h2 className="sect-h">Bewertungs-Basis &amp; Kundenstimmen</h2>
          <div className="stagger mt-2 grid gap-3 lg:grid-cols-3">
            {original?.ratingDist && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold">Sterne-Verteilung (Amazon, Import {original.createdAt.toLocaleDateString("de-DE")})</h3>
                <div className="mt-3">
                  <SterneDonut dist={original.ratingDist} avg={original.ratingAvg} total={original.reviewsTotal} />
                </div>
              </div>
            )}
            <div className="card p-4">
              <HaeufigkeitsBalken titel="Größte Pain Points (Anteil kritischer Stimmen)" farbe="bg-red-500" eintraege={pains} />
            </div>
            <div className="card p-4">
              <HaeufigkeitsBalken titel="Größte Kaufauslöser (Anteil positiver Stimmen)" farbe="bg-emerald-500" eintraege={trigs} />
            </div>
          </div>
        </section>
      )}

      {analysis.sov && (
        <section className="mt-6">
          <h2 className="sect-h">Markt-Position (Share of Voice)</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Eigener SOV", `${analysis.sov.brandSOV} %`],
              ["Top-Wettbewerber", analysis.sov.topCompetitor ? `${analysis.sov.topCompetitor.sov} %` : "–"],
              ["Top-10-Abdeckung", `${analysis.sov.top10Coverage} %`],
              ["Quick Wins", String(analysis.sov.quickWinCount)],
            ].map(([l, v]) => (
              <div key={l} className="card p-3">
                <div className="text-lg font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-neutral-500">{l}</div>
              </div>
            ))}
          </div>
          {analysis.sov.corridor.high > 0 && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Indikatives Potenzial über die Top-Umsatzlücken: <b>{fmt(analysis.sov.corridor.low)}–{fmt(analysis.sov.corridor.high)} €/Monat</b> (Korridor, keine Garantie).
            </p>
          )}
          {analysis.sov.topGaps.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-neutral-200 text-left text-[11px] uppercase text-neutral-500 dark:border-neutral-800">
                  <th className="py-1 pr-2">Keyword</th><th className="pr-2">SV</th><th className="pr-2">Wir</th><th className="pr-2">Bester Comp</th><th className="pr-2">Lücke €/Mo</th><th>Hebel</th>
                </tr></thead>
                <tbody>
                  {analysis.sov.topGaps.map((g) => (
                    <tr key={g.keyword} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="py-1 pr-2 font-medium">{g.keyword}</td>
                      <td className="pr-2 tabular-nums">{fmt(g.sv)}</td>
                      <td className="pr-2 tabular-nums">{g.mainRank || "–"}</td>
                      <td className="pr-2 tabular-nums">{g.bestCompRank || "–"}</td>
                      <td className="pr-2 tabular-nums">{fmt(g.fullRevGap)}</td>
                      <td className="text-xs text-neutral-500">{g.lever}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!measurable && (
        <div className="mt-6 card border-dashed p-6 text-sm text-muted">
          Hier gibt es noch nichts zu analysieren: weder importiertes Original-Listing noch erstellter Content.
          Erst auf der Produktseite „Listing von Amazon laden" (ASIN vorhanden) oder Texte erstellen — dann misst
          die Analyse jede Sektion gegen die Regeln und zeigt echte Scores.
        </div>
      )}

      {/* ── Quality Score + Keyword-Abdeckung — die inhaltlichen Kern-Messungen ── */}
      {(detByKey.voc || detByKey["seo-coverage"]) && (
        <section className="mt-6">
          <h2 className="sect-h">Quality Score &amp; Keyword-Abdeckung</h2>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {[detByKey.voc, detByKey["seo-coverage"]].filter(Boolean).map((d) => (
              <div key={d!.key} className={`card p-4 ${d!.key === "voc" ? "border-l-4 border-l-[var(--primary)]" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{d!.label}</h3>
                  <div className="flex items-center gap-2">
                    <span className="tag">gemessen</span>
                    <span className="text-lg font-semibold tabular-nums">{d!.score}</span>
                  </div>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hair">
                  <div className={`h-full ${d!.score >= 80 ? "bg-emerald-500" : d!.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d!.score}%` }} />
                </div>
                <ul className="mt-2 space-y-0.5">
                  {d!.findings.slice(0, 7).map((f, i) => <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">· {f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Sektionen im Detail: Richtlinien-Score + KI-Befund + Live-Abgleich in EINER Karte (D126) ── */}
      <section className="mt-6">
        <h2 className="sect-h">Sektionen im Detail</h2>
        <p className="mt-1 text-xs text-muted">
          Je Sektion: <b>Richtlinien-Score</b> (deterministisch gemessen: Länge, Keyword-Pflichten, Verbote) + <b>KI-Befund</b> (Ist-Stand,
          Probleme, Empfehlung) + <b>Live-Abgleich</b> (ist der freigegebene Text auf Amazon wiederzufinden? Grün ab 85 % Deckung).
          Basis: Titel {quelleText(quellen.title)} · Bullets {quelleText(quellen.bullets)} · Beschreibung {quelleText(quellen.description)} ·
          Backend {quelleText(quellen.backendKeywords)} — Entwürfe zählen nicht (deren Prüfung steht im Optimizer).
        </p>
        <div className="stagger mt-2 grid gap-3 lg:grid-cols-2">
          {textSektionen.map(({ key, live }) => {
            const det = detByKey[key];
            const ki = kiByKey[key];
            return (
              <div key={key} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{labelFuer[key]}</h3>
                  <div className="flex items-center gap-2">
                    {live ? liveBadge(key as "title" | "bullets" | "description", sektionSoll[key as "title" | "bullets" | "description"]) : <span className="pill pill-neutral" title="Backend-Keywords sind von außen nicht sichtbar — kein Live-Abgleich möglich.">live nicht sichtbar</span>}
                  </div>
                </div>
                {det?.measured ? (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Richtlinien-Score (gemessen)</span>
                      <span className="font-semibold tabular-nums">{det.score}/100</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hair">
                      <div className={`h-full ${det.score >= 80 ? "bg-emerald-500" : det.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${det.score}%` }} />
                    </div>
                    {det.findings.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {det.findings.slice(0, 4).map((f, i) => <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">· {f}</li>)}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Richtlinien-Score: nicht messbar — Inhalt fehlt.</p>
                )}
                {ki && (ki.score10 !== null || ki.aktuell) && (
                  <div className="mt-3 border-t border-hair pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">KI-Befund</span>
                      {ki.score10 !== null && (
                        <span className={`font-semibold tabular-nums ${ki.score10 >= 8 ? "text-emerald-600" : ki.score10 >= 5 ? "text-amber-600" : "text-red-600"}`}>{fmt1(ki.score10)}/10</span>
                      )}
                    </div>
                    {ki.aktuell && <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{ki.aktuell}</p>}
                    {ki.probleme.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {ki.probleme.map((p, i) => <li key={i} className="text-xs text-bad">✕ {p}</li>)}
                      </ul>
                    )}
                    {ki.empfehlung && <p className="mt-1.5 text-xs"><b>→</b> {ki.empfehlung}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Weitere Dimensionen (Bilder deterministisch; A+/Bewertungs-Basis/Preis aus der KI-Bewertung) */}
        {deepAudit && (
          <div className="stagger mt-3 grid gap-3 lg:grid-cols-2">
            {(["images", "aplus", "reviews", "price"] as const).map((key) => {
              const d = kiByKey[key];
              if (!d) return null;
              return (
                <div key={key} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{d.label}</h3>
                    {d.score10 !== null ? (
                      <span className={`text-lg font-semibold tabular-nums ${d.score10 >= 8 ? "text-emerald-600" : d.score10 >= 5 ? "text-amber-600" : "text-red-600"}`}>
                        {fmt1(d.score10)}<span className="text-xs font-normal text-neutral-400">/10</span>
                      </span>
                    ) : (
                      <span className="pill pill-neutral">nicht bewertbar</span>
                    )}
                  </div>
                  {d.score10 !== null && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hair">
                      <div className={`bar-fill h-full rounded-full ${d.score10 >= 8 ? "bg-emerald-500" : d.score10 >= 5 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d.score10 * 10}%` }} />
                    </div>
                  )}
                  {d.aktuell && <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{d.aktuell}</p>}
                  {d.probleme.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {d.probleme.map((p, i) => <li key={i} className="text-xs text-bad">✕ {p}</li>)}
                    </ul>
                  )}
                  {d.empfehlung && <p className="mt-2 text-xs"><b>→</b> {d.empfehlung}</p>}
                </div>
              );
            })}
          </div>
        )}
        {deepAudit && (
          <p className="mt-2 text-[11px] text-muted">Datenbasis: {deepAudit.dataBasis.join(" · ")} · KI-Befunde durch den Wahrheits-Filter geprüft (nachweislich falsche Behauptungen werden entfernt und ausgewiesen) · Bilder bewertet der Code, nie die KI.</p>
        )}
      </section>

      {/* Stärken & Schwächen im Insight-Karten-Format (D135) — dasselbe Schema
          wie die Review-Erkenntnisse, deterministisch aus dem Audit gemappt */}
      {deepAudit && befundKarten(deepAudit.payload, deepAudit.dataBasis).length > 0 && (
        <section className="mt-6">
          <h2 className="sect-h">Stärken & Schwächen (aus dem Tiefen-Audit)</h2>
          <div className="mt-2 space-y-2">
            {befundKarten(deepAudit.payload, deepAudit.dataBasis).map((k, i) => (
              <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={0} belegHinweis="aus Tiefen-Audit" />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="sect-h">Maßnahmen (priorisiert)</h2>
        {(() => {
          const karten = massnahmenKarten(
            deepAudit?.payload.topActions ?? [],
            analysis.recommendations,
            deepAudit?.dataBasis ?? [],
          );
          return karten.length > 0 ? (
            <div className="mt-2 space-y-2">
              {karten.map((k, i) => (
                <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={0} belegHinweis={i < (deepAudit?.payload.topActions.length ?? 0) ? "Tiefen-Audit" : "Regel-Messung"} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">Keine offenen Maßnahmen — Listing ist regelkonform.</p>
          );
        })()}
      </section>

      {/* Keine Dopplungen (D111): Text-Begründungen stehen im Optimizer direkt
          unter jeder Sektion; Bild-/A+-Briefs zum Copy-Pasten unter Creative-Briefs. */}
      <section className="mt-8 print:hidden">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-muted">
            Text-Begründungen (warum jeder Baustein so formuliert ist) stehen im Optimizer direkt unter jeder Sektion.
            Bild- und A+-Briefs zum Copy-Pasten liegen gesammelt unter Creative-Briefs.
          </p>
          <div className="flex flex-none gap-2">
            <Link href={`/produkte/${id}`} className="btn-ghost text-xs">Zum Optimizer</Link>
            <Link href={`/produkte/${id}/briefs`} className="btn-ghost text-xs">Zu den Creative-Briefs →</Link>
          </div>
        </div>
      </section>

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-[10px] text-neutral-400 dark:border-neutral-800">
        temoa · Produkt-Analyse · Datenbasis: {sovAudit ? `SOV-Audit (${sovAudit.keywordCount} Keywords)` : "ohne SOV-Report"} · {insights ? `Review-Insights (${insights.dataBasis}, ${insights.confidence})` : "ohne Review-Insights"} · Evidenz je Dimension ausgewiesen
      </footer>
    </main>
  );
}
