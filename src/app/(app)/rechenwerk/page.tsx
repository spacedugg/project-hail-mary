import { OsShell } from "@/components/shell";
import { RECHENWERK } from "@/lib/rechenwerk";
import { RULES } from "@/lib/validation/rules";
import { getFeeConfigState } from "@/lib/settings";
import { DEFAULT_FEE_CONFIG } from "@/lib/margin/fees";
import { saveFeeConfigAction, resetFeeConfigAction } from "@/app/actions";
import { IconSearch, IconEuro, IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

const pct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n * 100)} %`;

/**
 * Rechenwerk (D61) — die Anti-Blackbox-Seite: jede Formel, jede Regel,
 * jede Gebühren-Tabelle, mit der das Tool rechnet. Die Tabellen unten sind
 * LIVE (dieselbe Konfiguration, die die Engine nutzt) und austauschbar.
 */
export default async function RechenwerkPage() {
  const feeState = await getFeeConfigState();
  const cfg = feeState.config;
  const input = "input-base";

  return (
    <OsShell>
      <main className="mx-auto max-w-4xl p-8">
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

        {/* Gebühren-Tabellen — LIVE + austauschbar */}
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
            Diese Werte rechnen LIVE in jeder Margen-Kalkulation. Amazon ändert Gebühren — hier die aktuelle Version eintragen und speichern;
            bestehende Produkt-Kalkulationen behalten ihren Stand, bis sie neu berechnet werden. Default: 1:1 aus dem Margenkalkulation-Workbook.
          </p>

          <form action={saveFeeConfigAction} className="mt-4 space-y-5">
            <div>
              <h3 className="sect-h">Verkaufsgebühr je Kategorie (% vom Brutto-VK)</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {Object.entries(cfg.referralFlat).map(([cat, rate]) => (
                  <label key={cat} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate" title={cat}>{cat}</span>
                    <span className="flex flex-none items-center gap-1">
                      <input name={`flat:${cat}`} defaultValue={new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(rate * 100)} inputMode="decimal" className={`${input} w-16 !py-1 text-right`} />
                      <span className="text-muted">%</span>
                    </span>
                  </label>
                ))}
              </div>
              <h4 className="mt-3 text-xs font-medium text-muted">Preis-Staffeln</h4>
              <div className="mt-1 space-y-1.5">
                {cfg.referralTiered.map((t) => (
                  <div key={t.category} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-44 truncate font-medium">{t.category}</span>
                    <span className="text-muted">bis</span>
                    <input name={`tier:${t.category}:threshold`} defaultValue={t.thresholdEur} inputMode="decimal" className={`${input} w-16 !py-1 text-right`} />
                    <span className="text-muted">€ →</span>
                    <input name={`tier:${t.category}:below`} defaultValue={t.belowOrEq * 100} inputMode="decimal" className={`${input} w-14 !py-1 text-right`} />
                    <span className="text-muted">% · darüber →</span>
                    <input name={`tier:${t.category}:above`} defaultValue={t.above * 100} inputMode="decimal" className={`${input} w-14 !py-1 text-right`} />
                    <span className="text-muted">%</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="sect-h">Lagergebühr</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span>Standard</span>
                <input name="storage:standard" defaultValue={cfg.storage.standardPerM3Month} inputMode="decimal" className={`${input} w-24 !py-1 text-right`} />
                <span className="text-muted">€/m³/Monat · Bekleidung</span>
                <input name="storage:apparel" defaultValue={cfg.storage.apparelPerM3Month} inputMode="decimal" className={`${input} w-24 !py-1 text-right`} />
                <span className="text-muted">€/m³/Monat · pauschal</span>
                <input name="storage:months" defaultValue={cfg.storage.months} inputMode="decimal" className={`${input} w-14 !py-1 text-right`} />
                <span className="text-muted">Monate je Einheit</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="sect-h">Entsorgung Standard-Größe</h3>
                <p className="mt-1 text-[11px] text-muted">Eine Zeile je Stufe: „Gewichtsgrenze in g (exklusiv); Gebühr €" — erste Zeile mit Gewicht &gt; Grenze gewinnt. Letzte Zeile −1 = Auffangwert.</p>
                <textarea name="disposal:standard" rows={8} defaultValue={cfg.disposalStandard.map(([g, f]) => `${g};${f}`).join("\n")} className={`${input} mt-1 font-mono text-xs`} />
              </div>
              <div>
                <h3 className="sect-h">Entsorgung Oversize <span className="font-normal normal-case">(ab einer Seite ≥ <input name="oversizeSideCm" defaultValue={cfg.oversizeSideCm} inputMode="decimal" className={`${input} inline-block w-14 !py-0.5 text-right`} /> cm)</span></h3>
                <p className="mt-1 text-[11px] text-muted">Gleiche Logik wie Standard.</p>
                <textarea name="disposal:oversize" rows={8} defaultValue={cfg.disposalOversize.map(([g, f]) => `${g};${f}`).join("\n")} className={`${input} mt-1 font-mono text-xs`} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary">Tabellen speichern — rechnet ab sofort</button>
              <span className="text-xs text-muted">Beispiel-Kontrolle mit aktuellem Stand: „Alles andere", 9,90 € → Verkaufsgebühr {pct(cfg.referralFlat["Alles andere"] ?? 0)} = {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format((cfg.referralFlat["Alles andere"] ?? 0) * 9.9)} €</span>
            </div>
          </form>
          {feeState.source === "override" && (
            <form action={resetFeeConfigAction} className="mt-2">
              <button className="btn-ghost text-xs">Auf Workbook-Standard zurücksetzen</button>
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
