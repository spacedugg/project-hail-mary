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
 * Überwacht wird NUR, was sich am Live-Listing ehrlich lesen lässt: Titel und
 * Bullet Points (D236, Nutzer-Entscheidung). Bewusst NICHT mehr:
 * - Beschreibung — wird vom A+-Content überlagert/ersetzt, selten echtes Soll.
 * - Backend-Keywords — am Listing nie sichtbar, ohne API nicht prüfbar.
 * - Hauptbild — Amazon vergibt beim Upload eine neue Bild-ID (neue CDN-URL),
 *   selbe ASIN hin oder her; ein URL-Vergleich sagt nichts. Echter Vergleich
 *   bräuchte Bild-Hashing.
 * Der Sinn der übrigen zwei: erkennen, ob unser freigegebenes Soll noch live
 * steht — oder überschrieben/zurückgesetzt wurde (Drift-Erkennung).
 *
 * Ohne Ist-Stand gibt es keine Accuracy — dann steht dort „—", nicht 0/100 %.
 */

// Nur diese Plätze werden überwacht und angezeigt.
const UEBERWACHT: SlotAbgleich["slot"][] = ["title", "bullets"];

const STATUS: Record<SlotAbgleich["status"], { pill: string; text: string }> = {
  live: { pill: "pill pill-good", text: "live" },
  abweichung: { pill: "pill pill-bad", text: "weicht ab" },
  fehlt_live: { pill: "pill pill-bad", text: "fehlt live" },
  kein_soll: { pill: "pill pill-neutral", text: "kein Soll" },
  nicht_pruefbar: { pill: "pill pill-neutral", text: "nicht prüfbar" },
};

type Ton = "good" | "warn" | "bad" | "neutral";

/** Deckungsgleich → grün, ≥ 80 % → orange, darunter → rot. Nicht prüfbar → neutral. */
function ton(s: SlotAbgleich): Ton {
  if (s.status === "kein_soll" || s.status === "nicht_pruefbar") return "neutral";
  if (s.aehnlichkeit === null) return "neutral";
  if (s.aehnlichkeit >= 0.999) return "good";
  if (s.aehnlichkeit >= 0.8) return "warn";
  return "bad";
}

/** Schlimmster Ton der überwachten Plätze gewinnt für die ASIN-Kopfzeile. */
function gesamtTon(toene: Ton[]): Ton {
  if (toene.includes("bad")) return "bad";
  if (toene.includes("warn")) return "warn";
  if (toene.includes("good")) return "good";
  return "neutral";
}

const TINT: Record<Ton, string> = {
  good: "bg-[rgb(22_163_74/0.07)]",
  warn: "bg-[rgb(217_119_6/0.08)]",
  bad: "bg-[rgb(220_38_38/0.07)]",
  neutral: "",
};
const RAND: Record<Ton, string> = {
  good: "border-l-[3px] border-l-[var(--good)]",
  warn: "border-l-[3px] border-l-[var(--warn)]",
  bad: "border-l-[3px] border-l-[var(--bad)]",
  neutral: "border-l-[3px] border-l-transparent",
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
                Wie viel <b>unseres Solls</b> (Titel &amp; Bullets) live steht — ist unsere Arbeit angekommen. Ziel ≥ 95 %.
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
          <b>Überwacht werden Titel &amp; Bullet Points</b> — die Plätze, die sich am Live-Listing ehrlich lesen lassen.
          Der Knopf vergleicht jedes Produkt (freigegebener Stand gegen zuletzt gecrawltes Listing), hält das Ergebnis
          mit Datum fest und legt für jede Abweichung einen Alert an. <b>Später übernimmt das ein täglicher
          Automatik-Lauf.</b>
        </p>
        <p className="mt-2 rounded-xl border border-hair p-2.5 text-[11px] text-muted">
          <b>Ehrliche Grenze:</b> Verglichen wird gegen den zuletzt <i>gecrawlten</i> Stand, nicht gegen Amazon live.
          Ist der Crawl alt, ist auch der Befund alt — dann je Produkt neu einlesen.
        </p>
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

      <section className="mt-4 card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Live-Überwachung je ASIN</h2>
          <span className="text-xs text-muted">Auf eine ASIN klicken → Titel- &amp; Bullet-Vergleich</span>
        </div>

        <div className="mt-3 space-y-2">
          {cms.produkte
            .filter((p) => p.variantRole !== "parent")
            .map((p) => {
              const slots = p.abgleich.slots.filter((s) => UEBERWACHT.includes(s.slot));
              const gesamt = gesamtTon(slots.map(ton));
              const ls = live.produkte.find((x) => x.productId === p.id);
              const sc = ls?.score.score ?? null;
              const d = scoreDelta(ls?.vorher ?? null, sc);
              return (
                <details key={p.id} className={`rounded-xl border border-hair ${RAND[gesamt]} ${TINT[gesamt]}`}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2.5 p-3">
                    {p.bildUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.bildUrl} alt="" className="h-11 w-11 flex-none rounded-lg border border-hair bg-white object-contain" />
                    ) : (
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-hair bg-[var(--primary-soft)] text-[10px] text-primary-strong">ASIN</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {p.asin && <span className="font-mono">{p.asin}</span>}
                        <span>
                          {p.snapshotAlter
                            ? `· Ist-Stand ${p.snapshotAlter.toLocaleDateString("de-DE")}`
                            : "· noch kein Ist-Stand"}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1.5">
                      <span
                        className={sc === null ? "pill pill-neutral" : sc >= 80 ? "pill pill-good" : "pill pill-warn"}
                        title="Live-Qualitäts-Score"
                      >
                        Live {sc === null ? "—" : `${sc}/100`}
                        {d.delta !== null && d.delta !== 0 ? ` (${d.delta > 0 ? "+" : ""}${d.delta})` : ""}
                        {d.einbruch ? " ⚠︎" : ""}
                      </span>
                      <span
                        className={p.abgleich.accuracyPct === null ? "pill pill-neutral" : p.abgleich.accuracyPct >= 95 ? "pill pill-good" : "pill pill-warn"}
                        title="Content-Accuracy"
                      >
                        {p.abgleich.accuracyPct === null ? "Acc. —" : `Acc. ${p.abgleich.accuracyPct} %`}
                      </span>
                    </span>
                  </summary>

                  <div className="border-t border-hair/60 px-3 pb-3">
                    {slots.length === 0 ? (
                      <p className="py-2 text-xs text-muted">Für Titel &amp; Bullets liegt kein Soll vor.</p>
                    ) : (
                      <div className="mt-2 overflow-x-auto">
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
                            {slots.map((s) => (
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
                    )}

                    {p.asin && (
                      <form action={importListingFromAmazon} className="mt-3">
                        <input type="hidden" name="productId" value={p.id} />
                        <SubmitButton className="btn-ghost text-xs" pendingLabel="Liest ein …" progress>
                          Live-Listing neu einlesen
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
        </div>
      </section>
    </>
  );
}
