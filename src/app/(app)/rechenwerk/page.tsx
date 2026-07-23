import { OsShell } from "@/components/shell";
import { RECHENWERK, BERICHTE, KOMBI_KENNZAHLEN } from "@/lib/rechenwerk";
import { DATENFLUSS } from "@/lib/datenfluss/register";
import { BerichteSuche, KpiSuche } from "@/components/register-suche";
import { RULES } from "@/lib/validation/rules";
import { desc, eq } from "drizzle-orm";
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

  // QM-Blockier-Log (D182/D193): welche Regel scheitert wie oft? Jeder Block
  // ist ein Bau-Auftrag — diese Auswertung macht ihn sichtbar statt flüchtig.
  const qmBlockRows = await db.query.qmBlocks.findMany({ orderBy: desc(schema.qmBlocks.createdAt), limit: 100 });
  const regelStatistik = new Map<string, { anzahl: number; zuletzt: Date; beispiel: string }>();
  for (const b of qmBlockRows)
    for (const f of b.findings) {
      const e = regelStatistik.get(f.rule);
      if (e) {
        e.anzahl++;
        if (b.createdAt > e.zuletzt) { e.zuletzt = b.createdAt; e.beispiel = f.message; }
      } else {
        regelStatistik.set(f.rule, { anzahl: 1, zuletzt: b.createdAt, beispiel: f.message });
      }
    }
  const regelnNachHaeufigkeit = [...regelStatistik.entries()].sort((a, b) => b[1].anzahl - a[1].anzahl);

  return (
    <OsShell>
      <main className="w-full p-8">
        <h1 className="page-title">Daten & Formeln</h1>
        <p className="page-sub">
          Welche Berichte wir uns ziehen, welche Kennzahlen daraus entstehen und wie jede Formel rechnet — mit Quelle und Code-Ort.
          Die Gebühren-Tabellen sind live: was hier steht, rechnet ab sofort. Damit bleibt das Tool nachvollziehbar statt Blackbox.
        </p>

        {/* Berichte-Register (D85): welche Berichte wir ziehen und was sie liefern */}
        <section className="mt-8 card p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-violet"><IconUpload /></span>
            <div>
              <h2 className="text-sm font-semibold">Berichte — was wir uns von Amazon ziehen</h2>
              <p className="text-xs text-muted">Nur diese Berichte braucht das Tool. Alles andere ist unnötig.</p>
            </div>
          </div>
          <BerichteSuche berichte={BERICHTE} />
          <p className="mt-2 text-[11px] text-muted">
            Listing-Inhalte, Bilder und Bewertungen brauchen KEINEN Bericht — die holt das Tool per Scrape, die ASIN reicht.
          </p>
        </section>

        {/* Datenfluss-Register (D180/D186): jede Input-Kette deklariert und testgesichert */}
        <section className="mt-3 card p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-violet"><IconCheck /></span>
            <div>
              <h2 className="text-sm font-semibold">Datenfluss — was mit jedem Datenpunkt passiert</h2>
              <p className="text-xs text-muted">Quelle → Speicher → Analysen (mit Code-Ort) → Verwendung → Anzeige. Testgesichert: jeder Code-Ort existiert, keine Kette unvollständig.</p>
            </div>
          </div>
          <div className="mt-3 space-y-4">
            {DATENFLUSS.map((d) => (
              <details key={d.id} className="rounded-xl bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium">{d.name}</summary>
                <div className="mt-2 space-y-2 text-xs">
                  <p><b>Quelle:</b> {d.quelle} · <b>Speicher:</b> <code className="text-[11px]">{d.speicher}</code></p>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                        <th className="py-1 pr-3">Analyse</th><th className="pr-3">Outcome</th><th>Code-Ort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.analysen.map((a) => (
                        <tr key={a.modul + a.name} className="border-b border-hair align-top last:border-0">
                          <td className="py-1 pr-3 font-medium">{a.name}</td>
                          <td className="pr-3">{a.outcome}</td>
                          <td><code className="text-[11px]">{a.modul}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p><b>Verwendung:</b> {d.verwendung.join(" · ")}</p>
                  <p><b>Anzeige:</b> {d.anzeige.join(" · ")}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* QM-Blockier-Log (D182/D193): jeder Block ist ein Bau-Auftrag */}
        <section className="mt-3 card p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-amber"><IconCheck /></span>
            <div>
              <h2 className="text-sm font-semibold">QM-Blockier-Log — welche Regel scheitert wie oft?</h2>
              <p className="text-xs text-muted">Jeder harte QM-Block wird hier gezählt. Häufige Wiederholungen derselben Regel sind Bau-Aufträge (neuer Fixer, bessere Regel oder fehlender Input), keine Zufälle.</p>
            </div>
          </div>
          {regelnNachHaeufigkeit.length === 0 ? (
            <p className="mt-3 text-xs text-muted">Keine Blockier-Ereignisse aufgezeichnet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                    <th className="py-1 pr-3">Regel</th><th className="pr-3">Verstöße</th><th className="pr-3">Zuletzt</th><th>Letzter Beleg</th>
                  </tr>
                </thead>
                <tbody>
                  {regelnNachHaeufigkeit.map(([regel, s]) => (
                    <tr key={regel} className="border-b border-hair align-top last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs">{regel}</td>
                      <td className="pr-3 tabular-nums font-medium">{s.anzahl}</td>
                      <td className="pr-3 whitespace-nowrap text-xs text-muted">{s.zuletzt.toLocaleString("de-DE")}</td>
                      <td className="text-xs text-neutral-700 dark:text-neutral-300">{s.beispiel.slice(0, 160)}{s.beispiel.length > 160 ? "…" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Kombinierte Kennzahlen: entstehen erst aus mehreren Quellen */}
        <section className="mt-3 card p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-teal"><IconCheck /></span>
            <div>
              <h2 className="text-sm font-semibold">Kombinierte Kennzahlen — brauchen mehrere Quellen</h2>
              <p className="text-xs text-muted">Fehlt eine der Quellen, fehlt die Kennzahl — das Tool zeigt dann den Nachlade-Hinweis statt einer Schätzung.</p>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                  <th className="py-1 pr-3">Kennzahl</th><th className="pr-3">Entsteht aus</th><th>Formel / Regel</th>
                </tr>
              </thead>
              <tbody>
                {KOMBI_KENNZAHLEN.map((k) => (
                  <tr key={k.name} className="border-b border-hair align-top last:border-0">
                    <td className="py-2 pr-3 font-medium">{k.name}</td>
                    <td className="pr-3 text-xs">{k.aus}</td>
                    <td className="text-xs text-neutral-700 dark:text-neutral-300">{k.formel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* KPI-Register — durchsuchbar inkl. kombinierter Kennzahlen (D88) */}
        <section className="mt-8">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-violet"><IconSearch /></span>
            <h2 className="text-sm font-semibold">KPI- & Formel-Register</h2>
          </div>
          <KpiSuche gruppen={RECHENWERK} kombi={KOMBI_KENNZAHLEN} />
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
