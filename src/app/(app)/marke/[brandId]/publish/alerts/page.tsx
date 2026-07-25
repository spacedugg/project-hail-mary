import { notFound } from "next/navigation";
import { and, eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeMarkenCms, ladeLiveScores } from "@/lib/cms/laden";
import { scoreDelta } from "@/lib/cms/livescore";
import type { SlotAbgleich } from "@/lib/cms/accuracy";
import { importListingFromAmazon } from "@/app/actions";
import { abgleichFestschreiben, alertStatusSetzen } from "@/app/cms-actions";
import { SubmitButton } from "@/components/submit-button";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Soll/Ist-Abgleich + Content-Alerts.
 *
 * Soll = unser freigegebener Stand · Ist = das zuletzt gecrawlte Live-Listing.
 * Ehrliche Grenzen stehen an der Zeile, nicht im Kleingedruckten:
 * Backend-Keywords sind nie am Listing sichtbar, Bilder liefert Amazon über
 * eigene CDN-Adressen (prüfbar ist nur „Hauptbild vorhanden"). Ohne Ist-Stand
 * gibt es keine Accuracy — dann steht dort „—", nicht 0 % und nicht 100 %.
 */

const STATUS: Record<SlotAbgleich["status"], { pill: string; text: string }> = {
  live: { pill: "pill pill-good", text: "live" },
  abweichung: { pill: "pill pill-bad", text: "weicht ab" },
  fehlt_live: { pill: "pill pill-bad", text: "fehlt live" },
  kein_soll: { pill: "pill pill-neutral", text: "kein Soll" },
  nicht_pruefbar: { pill: "pill pill-neutral", text: "nicht prüfbar" },
};

export default async function CmsAbgleich({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ fehler?: string; code?: string; hinweis?: string }>;
}) {
  const { brandId } = await params;
  const { fehler, code, hinweis } = await searchParams;
  const cms = await ladeMarkenCms(brandId);
  if (!cms) notFound();
  const live = await ladeLiveScores(brandId);

  const db = await getDb();
  const alerts = await db.query.contentAlerts.findMany({
    where: and(eq(schema.contentAlerts.brandId, brandId), eq(schema.contentAlerts.status, "offen")),
    orderBy: desc(schema.contentAlerts.createdAt),
  });

  return (
    <>
      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}
      {hinweis && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm text-primary-strong">ℹ {hinweis}</p>}

      <section className="mt-5 card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            {/* Live-Qualitäts-Score = Retail-Readiness (Bauplan v3.6) */}
            <div className="rounded-xl border border-hair p-3.5">
              <div className="stat-label">Live-Qualitäts-Score</div>
              <div className={`stat-value ${live.schnitt === null ? "" : live.schnitt >= 80 ? "text-good" : "text-bad"}`}>
                {live.schnitt === null ? "—" : `${live.schnitt}/100`}
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                Wie <b>gut</b> das ist, was live steht — dieselbe Messlatte wie die Analyse, dauerhaft auf den
                Live-Stand angewendet. Retail-ready ab 80.
              </p>
            </div>
            {/* Content-Accuracy = ist unsere Arbeit angekommen */}
            <div className="rounded-xl border border-hair p-3.5">
              <div className="stat-label">Content-Accuracy</div>
              <div className={`stat-value ${cms.accuracyPct === null ? "" : cms.accuracyPct >= 95 ? "text-good" : "text-bad"}`}>
                {cms.accuracyPct === null ? "—" : `${cms.accuracyPct} %`}
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                Wie viel <b>unseres Solls</b> live steht — ist unsere Arbeit angekommen. Ziel ≥ 95 %.
              </p>
            </div>
          </div>
          <form action={abgleichFestschreiben} className="flex-none">
            <input type="hidden" name="brandId" value={brandId} />
            <SubmitButton className="btn-primary text-xs" pendingLabel="Prüft …">
              Jetzt prüfen &amp; Alerts anlegen
            </SubmitButton>
          </form>
        </div>
        <p className="mt-3 rounded-xl border border-hair p-2.5 text-[11px] text-muted">
          <b>Was der Knopf tut:</b> Er vergleicht jedes Produkt (freigegebener Stand gegen zuletzt gecrawltes Listing),
          hält das Ergebnis mit Datum fest und legt für jede Abweichung einen Alert an. Der Vergleich selbst läuft
          immer live — festgehalten wird er nur, damit die Accuracy über die Zeit vergleichbar bleibt.
          <b> Später übernimmt das ein täglicher Automatik-Lauf</b>, dann entfällt der Knopf.
        </p>
        <p className="mt-2 rounded-xl border border-hair p-2.5 text-[11px] text-muted">
          <b>Ehrliche Grenze:</b> Verglichen wird gegen den zuletzt <i>gecrawlten</i> Stand, nicht gegen Amazon live.
          Ist der Crawl alt, ist auch der Befund alt — dann je Produkt neu einlesen.
        </p>
        {cms.produkte.some((p) => p.sollAusIst > 0) && (
          <p className="mt-2 rounded-xl border border-[var(--warn)]/40 bg-[rgb(217_119_6/0.08)] p-2.5 text-[11px]">
            <b>Was 100 % hier NICHT heißt:</b> Bei Plätzen, deren Soll der übernommene Live-Stand ist, misst die Accuracy
            nur, dass sich nichts verändert hat. Ein Qualitätswert wird daraus erst, wenn unser optimierter Content
            freigegeben und live ist.
          </p>
        )}
      </section>

      {alerts.length > 0 && (
        <section className="mt-4 card p-4">
          <h2 className="sect-h">Offene Content-Alerts</h2>
          <ul className="mt-2 space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-hair/60 pb-1.5 text-xs">
                <span className={a.schwere === "hoch" ? "pill pill-bad" : "pill pill-warn"}>{a.schwere}</span>
                <span>{a.nachricht}</span>
                <span className="text-muted">{a.createdAt.toLocaleDateString("de-DE")}</span>
                <form action={alertStatusSetzen} className="ml-auto">
                  <input type="hidden" name="alertId" value={a.id} />
                  <input type="hidden" name="brandId" value={brandId} />
                  <input type="hidden" name="status" value="erledigt" />
                  <SubmitButton className="btn-ghost text-[11px]">erledigt</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cms.produkte.map((p) => (
        <section key={p.id} className="mt-4 card p-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{p.name}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {p.snapshotAlter
                  ? `Ist-Stand gecrawlt am ${p.snapshotAlter.toLocaleDateString("de-DE")}`
                  : "Noch kein Ist-Stand — Live-Listing einlesen"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const ls = live.produkte.find((x) => x.productId === p.id);
                const sc = ls?.score.score ?? null;
                const d = scoreDelta(ls?.vorher ?? null, sc);
                return (
                  <span
                    className={sc === null ? "pill pill-neutral" : sc >= 80 ? "pill pill-good" : "pill pill-warn"}
                    title="Live-Qualitäts-Score"
                  >
                    Live {sc === null ? "—" : `${sc}/100`}
                    {d.delta !== null && d.delta !== 0 ? ` (${d.delta > 0 ? "+" : ""}${d.delta})` : ""}
                    {d.einbruch ? " ⚠︎" : ""}
                  </span>
                );
              })()}
              <span
                className={p.abgleich.accuracyPct === null ? "pill pill-neutral" : p.abgleich.accuracyPct >= 95 ? "pill pill-good" : "pill pill-warn"}
                title="Content-Accuracy"
              >
                {p.abgleich.accuracyPct === null ? "Acc. —" : `Acc. ${p.abgleich.accuracyPct} %`}
              </span>
              {p.asin && (
                <form action={importListingFromAmazon}>
                  <input type="hidden" name="productId" value={p.id} />
                  <SubmitButton className="btn-ghost text-xs" pendingLabel="Liest ein …" progress>
                    Live-Listing neu einlesen
                  </SubmitButton>
                </form>
              )}
            </div>
          </header>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3">Platz</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Übereinstimmung</th>
                  <th className="py-1.5 pr-3">Soll</th>
                  <th className="py-1.5">Ist (live)</th>
                </tr>
              </thead>
              <tbody>
                {p.abgleich.slots.map((s) => (
                  <tr key={s.slot} className="border-b border-hair/60 align-top">
                    <td className="py-1.5 pr-3 font-medium">{s.label}</td>
                    <td className="py-1.5 pr-3"><span className={STATUS[s.status].pill}>{STATUS[s.status].text}</span></td>
                    <td className="py-1.5 pr-3 tabular-nums text-xs">
                      {s.aehnlichkeit === null ? "—" : `${Math.round(s.aehnlichkeit * 100)} %`}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-muted">
                      {s.soll ? `${s.soll.slice(0, 110)}${s.soll.length > 110 ? "…" : ""}` : "—"}
                    </td>
                    <td className="py-1.5 text-xs text-muted">
                      {s.ist ? `${s.ist.slice(0, 110)}${s.ist.length > 110 ? "…" : ""}` : "—"}
                      {s.hinweis && <div className="mt-0.5 text-[11px]">{s.hinweis}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
