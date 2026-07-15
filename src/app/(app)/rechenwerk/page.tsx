import { OsShell } from "@/components/shell";
import { RECHENWERK } from "@/lib/rechenwerk";
import { RULES } from "@/lib/validation/rules";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getFeeConfigState } from "@/lib/settings";
import type { FeeConfig } from "@/lib/margin/fees";
import type { FeeChange } from "@/lib/margin/feesFromPdf";
import { uploadFeePdf, applyPendingFeeConfig, discardPendingFeeConfig, resetFeeConfigAction } from "@/app/actions";
import { IconSearch, IconEuro, IconCheck, IconUpload } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";

type PendingFees =
  | { config: FeeConfig; changes: FeeChange[]; warnings: string[]; fileName: string; extractedBy: string; extractedAt: string }
  | { error: string; fileName: string; extractedBy: string; extractedAt: string };

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n * 100)} %`;

/**
 * Rechenwerk (D61) — die Anti-Blackbox-Seite: jede Formel, jede Regel,
 * jede Gebühren-Tabelle, mit der das Tool rechnet. Die Tabellen unten sind
 * LIVE (dieselbe Konfiguration, die die Engine nutzt) und austauschbar.
 */
export default async function RechenwerkPage() {
  const feeState = await getFeeConfigState();
  const cfg = feeState.config;
  const db = await getDb();
  const pendingRow = await db.query.settings.findFirst({ where: eq(schema.settings.key, "fee_config_pending") });
  const pending = (pendingRow?.value as PendingFees | undefined) ?? null;

  return (
    <OsShell>
      <main className="w-full p-8">
        <h1 className="page-title">Rechenwerk</h1>
        <p className="page-sub">
          Wie das Tool rechnet — jede Formel mit Quelle und Code-Ort, jede Regel, jede Gebühren-Tabelle.
          Die Tabellen sind live: was hier steht, rechnet ab sofort. Damit bleibt das Tool nachvollziehbar statt Blackbox.
        </p>

        {/* KPI-Register */}
        <section className="mt-8">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-violet"><IconSearch /></span>
            <h2 className="text-sm font-semibold">KPI- & Formel-Register</h2>
          </div>
          <div className="stagger mt-3 space-y-3">
            {RECHENWERK.map((g) => (
              <details key={g.titel} className="card p-4">
                <summary className="cursor-pointer text-sm font-semibold">{g.titel} <span className="ml-1 text-xs font-normal text-muted">· {g.eintraege.length} Größen</span></summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                        <th className="py-1 pr-3">Größe</th><th className="pr-3">Formel / Regel</th><th className="pr-3">Quelle</th><th>Rechnet in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.eintraege.map((e) => (
                        <tr key={e.name} className="border-b border-hair align-top last:border-0">
                          <td className="py-2 pr-3 font-medium">{e.name}</td>
                          <td className="pr-3 text-neutral-700 dark:text-neutral-300">{e.formel}{e.hinweis && <span className="block text-xs text-muted">{e.hinweis}</span>}</td>
                          <td className="pr-3 text-xs text-muted">{e.quelle}</td>
                          <td className="font-mono text-[11px] text-muted">{e.code}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Content-Limits — LIVE aus den RULES */}
        <section className="mt-8 card p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-teal"><IconCheck /></span>
            <h2 className="text-sm font-semibold">Content-Limits (live aus dem Validation-Gate)</h2>
          </div>
          <p className="mt-1 text-xs text-muted">Quelle: knowledge/content-Specs → src/lib/validation/rules.ts — dieselben Werte, gegen die das Gate prüft.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500"><th className="py-1 pr-3">Sektion</th><th className="pr-3">Maximum</th><th>Ausschöpfungs-Ziel</th></tr></thead>
              <tbody>
                <tr className="border-b border-hair"><td className="py-1.5 pr-3 font-medium">Titel</td><td className="pr-3 tabular-nums">{RULES.title.maxChars} Zeichen</td><td className="tabular-nums">ab {RULES.title.targetMinChars}</td></tr>
                <tr className="border-b border-hair"><td className="py-1.5 pr-3 font-medium">Bullets ({RULES.bullets.count} Stück)</td><td className="pr-3 tabular-nums">{RULES.bullets.hardMaxChars} Zeichen</td><td className="tabular-nums">ab {RULES.bullets.utilizationMinBytes} Bytes</td></tr>
                <tr className="border-b border-hair"><td className="py-1.5 pr-3 font-medium">Item Highlights</td><td className="pr-3 tabular-nums">{RULES.itemHighlights.maxChars} Zeichen</td><td className="tabular-nums">ab {RULES.itemHighlights.targetMinChars}</td></tr>
                <tr className="border-b border-hair"><td className="py-1.5 pr-3 font-medium">Backend-Keywords</td><td className="pr-3 tabular-nums">{RULES.backendKeywords.maxBytes} Bytes</td><td className="tabular-nums">ab {RULES.backendKeywords.utilizationMinBytes}</td></tr>
                <tr className="border-b border-hair"><td className="py-1.5 pr-3 font-medium">Beschreibung</td><td className="pr-3 tabular-nums">{RULES.description.maxBytes} Bytes</td><td className="tabular-nums">ab {RULES.description.utilizationMinBytes}</td></tr>
                <tr><td className="py-1.5 pr-3 font-medium">Q&A ({RULES.qa.pairs} Paare)</td><td className="pr-3 tabular-nums">Frage {RULES.qa.questionMaxChars} · Antwort {RULES.qa.answerMaxChars} Zeichen</td><td className="tabular-nums">Antwort ab {RULES.qa.answerUtilizationMinChars}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Gebühren-Tabellen — LIVE, Update per PDF (D62) */}
        <section className="mt-8 card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="icon-chip chip-amber"><IconEuro /></span>
              <h2 className="text-sm font-semibold">Amazon-Gebühren-Tabellen (Margen-Rechner)</h2>
            </div>
            {feeState.source === "override"
              ? <span className="pill pill-neutral">angepasste Version · {feeState.updatedAt?.toLocaleDateString("de-DE")} · {feeState.updatedBy}</span>
              : <span className="pill pill-good">Standard (Workbook-Stand)</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            Diese Werte rechnen LIVE in jeder Margen-Kalkulation. Aktualisierung: Amazon-Gebühren-PDF hochladen — das Tool extrahiert die
            Tabellen, prüft sie deterministisch und zeigt die Abweichungen zur Bestätigung. Amazon bietet keine öffentliche Tabellen-API;
            mit der SP-API-Anbindung (geplant) kommt die Gebühren-Vorschau je ASIN als automatische Gegenprobe.
          </p>

          {/* Update per PDF */}
          <form action={uploadFeePdf} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-background p-3">
            <IconUpload className="h-4 w-4 flex-none text-muted" />
            <span className="text-xs font-medium">Aktualisierte Amazon-Gebühren als PDF:</span>
            <input type="file" name="file" accept=".pdf" required className="text-sm" />
            <SubmitButton className="btn-primary text-xs" pendingLabel="Liest PDF & extrahiert Tabellen…" progress>Extrahieren & prüfen</SubmitButton>
          </form>

          {pending && (
            <div className="mt-3 rounded-xl border border-primary bg-primary-soft/40 p-4">
              {"error" in pending ? (
                <>
                  <p className="text-sm font-medium text-bad">✕ Extraktion fehlgeschlagen: {pending.error}</p>
                  <p className="mt-1 text-xs text-muted">{pending.fileName} · {new Date(pending.extractedAt).toLocaleString("de-DE")} · {pending.extractedBy}</p>
                  <form action={discardPendingFeeConfig} className="mt-2"><SubmitButton className="btn-ghost text-xs">Ausblenden</SubmitButton></form>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Vorschau aus {pending.fileName} <span className="font-normal text-muted">· {new Date(pending.extractedAt).toLocaleString("de-DE")} · {pending.extractedBy}</span></p>
                  {pending.changes.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {pending.changes.map((c, i) => (
                        <li key={i} className="text-sm"><b>{c.feld}:</b> <span className="text-muted line-through">{c.alt}</span> → <span className="font-medium text-primary-strong">{c.neu}</span></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Keine Änderungen gegenüber dem aktuellen Stand.</p>
                  )}
                  {pending.warnings.length > 0 && (
                    <ul className="mt-2 space-y-0.5">{pending.warnings.map((w, i) => <li key={i} className="text-xs text-warn">△ {w}</li>)}</ul>
                  )}
                  <div className="mt-3 flex gap-2">
                    {pending.changes.length > 0 && (
                      <form action={applyPendingFeeConfig}><SubmitButton className="btn-primary text-xs">Übernehmen — rechnet ab sofort</SubmitButton></form>
                    )}
                    <form action={discardPendingFeeConfig}><SubmitButton className="btn-ghost text-xs">Verwerfen</SubmitButton></form>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Wirksamer Stand — read-only */}
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="sect-h">Verkaufsgebühr je Kategorie (% vom Brutto-VK)</h3>
              <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {Object.entries(cfg.referralFlat).map(([cat, rate]) => (
                  <div key={cat} className="flex items-center justify-between border-b border-hair py-1 text-xs">
                    <span className="truncate" title={cat}>{cat}</span>
                    <span className="tabular-nums font-medium">{pct(rate)}</span>
                  </div>
                ))}
              </div>
              <h4 className="mt-3 text-xs font-medium text-muted">Preis-Staffeln</h4>
              <div className="mt-1 space-y-1">
                {cfg.referralTiered.map((t) => (
                  <div key={t.category} className="flex items-center justify-between border-b border-hair py-1 text-xs">
                    <span className="font-medium">{t.category}</span>
                    <span className="tabular-nums text-muted">bis {t.thresholdEur} € → {pct(t.belowOrEq)} · darüber {pct(t.above)}</span>
                  </div>
                ))}
              </div>
              <h4 className="mt-3 text-xs font-medium text-muted">Lagergebühr</h4>
              <p className="mt-1 text-xs">Standard <b>{cfg.storage.standardPerM3Month} €/m³/Monat</b> · Bekleidung <b>{cfg.storage.apparelPerM3Month} €/m³/Monat</b> · pauschal <b>{cfg.storage.months} Monate</b> je Einheit</p>
            </div>
            <div>
              <h3 className="sect-h">Entsorgung je Stück (Gewichtsstufen)</h3>
              <p className="mt-1 text-[11px] text-muted">Oversize, sobald eine Seite ≥ {cfg.oversizeSideCm} cm. Erste Stufe mit Gewicht &gt; Grenze gewinnt; −1 = Auffangwert.</p>
              <div className="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">Standard</div>
                  {cfg.disposalStandard.map(([g, fee]) => (
                    <div key={`s${g}`} className="flex justify-between border-b border-hair py-0.5 text-xs tabular-nums"><span>&gt; {g} g</span><b>{new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(fee)} €</b></div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">Oversize</div>
                  {cfg.disposalOversize.map(([g, fee]) => (
                    <div key={`o${g}`} className="flex justify-between border-b border-hair py-0.5 text-xs tabular-nums"><span>&gt; {g} g</span><b>{new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(fee)} €</b></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {feeState.source === "override" && (
            <form action={resetFeeConfigAction} className="mt-4">
              <SubmitButton className="btn-ghost text-xs">Auf Workbook-Standard zurücksetzen</SubmitButton>
            </form>
          )}
          <p className="mt-3 text-[11px] text-muted">
            Referenz zum Gegenprüfen (Workbook-Standard): 1L-Fixture → Marge 1,524022836 € = 18,319 %, Break-even-ACoS 15,394 % — als automatischer Regressionstest verankert.
          </p>
        </section>
      </main>
    </OsShell>
  );
}
