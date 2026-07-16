"use client";

import { useMemo, useState } from "react";
import type { BerichtEintrag, KombiKennzahl, KpiGruppe } from "@/lib/rechenwerk";

/**
 * Suchfelder für die Daten-&-Formeln-Register (D88): Berichte und KPIs
 * durchsuchbar — man tippt eine Kennzahl und sieht sofort, wie sie sich
 * zusammensetzt und woraus sie entsteht. Reine Client-Filterung über die
 * server-gelieferten Registerdaten.
 */

const norm = (s: string) => s.toLowerCase();
const trifft = (q: string, ...felder: Array<string | undefined>) =>
  felder.some((f) => f && norm(f).includes(q));

function SuchFeld({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input-base mt-3 w-full max-w-md"
    />
  );
}

// ── Berichte ─────────────────────────────────────────────────────────────────

export function BerichteSuche({ berichte }: { berichte: BerichtEintrag[] }) {
  const [q, setQ] = useState("");
  const query = norm(q.trim());
  const gefiltert = useMemo(
    () => (query ? berichte.filter((b) => trifft(query, b.name, b.plattform, b.quelle, b.liefert, b.imTool, b.status, b.turnus)) : berichte),
    [berichte, query],
  );

  return (
    <>
      <SuchFeld value={q} onChange={setQ} placeholder={"Bericht oder Kennzahl suchen — z. B. „CVR“, „Wasted Spend“, „Helium“"} />
      {query && (
        <p className="mt-1 text-[11px] text-muted">{gefiltert.length} von {berichte.length} Berichten passen auf „{q.trim()}"</p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
              <th className="py-1 pr-3">Bericht</th><th className="pr-3">Priorität</th><th className="pr-3">Plattform</th><th className="pr-3">Wo ziehen</th><th className="pr-3">Turnus</th><th className="pr-3">Liefert</th><th>Im Tool</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((b) => (
              <tr key={b.name} className="border-b border-hair align-top last:border-0">
                <td className="py-2 pr-3 font-medium">{b.name}</td>
                <td className="pr-3">
                  <span className={`pill ${b.status === "Pflicht" ? "pill-bad" : b.status === "empfohlen" ? "pill-warn" : "pill-neutral"}`}>{b.status}</span>
                </td>
                <td className="pr-3 whitespace-nowrap">
                  <span className={`pill ${b.plattform === "Seller Central" ? "chip-violet" : b.plattform === "Ads-Konsole" ? "chip-teal" : b.plattform === "Helium 10" ? "chip-pink" : "pill-neutral"}`}>{b.plattform}</span>
                </td>
                <td className="pr-3 text-xs text-muted">{b.quelle}</td>
                <td className="pr-3 text-xs">{b.turnus}</td>
                <td className="pr-3 text-xs">{b.liefert}</td>
                <td className="text-xs text-muted">{b.imTool}</td>
              </tr>
            ))}
            {gefiltert.length === 0 && (
              <tr><td colSpan={7} className="py-3 text-sm text-muted">Kein Bericht passt auf „{q.trim()}".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── KPI-Register (inkl. kombinierte Kennzahlen) ──────────────────────────────

export function KpiSuche({ gruppen, kombi }: { gruppen: KpiGruppe[]; kombi: KombiKennzahl[] }) {
  const [q, setQ] = useState("");
  const query = norm(q.trim());

  const treffer = useMemo(() => {
    if (!query) return null;
    const rows: Array<{ gruppe: string; name: string; formel: string; quelle: string; code: string; hinweis?: string }> = [];
    for (const k of kombi) {
      if (trifft(query, k.name, k.aus, k.formel)) {
        rows.push({ gruppe: "Kombinierte Kennzahlen", name: k.name, formel: k.formel, quelle: `entsteht aus: ${k.aus}`, code: "—" });
      }
    }
    for (const g of gruppen) {
      for (const e of g.eintraege) {
        if (trifft(query, e.name, e.formel, e.quelle, e.hinweis, g.titel)) {
          rows.push({ gruppe: g.titel, ...e });
        }
      }
    }
    return rows;
  }, [gruppen, kombi, query]);

  return (
    <>
      <SuchFeld value={q} onChange={setQ} placeholder={"KPI suchen — z. B. „TACoS“, „Break-even“, „Buybox“"} />

      {treffer ? (
        <>
          <p className="mt-1 text-[11px] text-muted">{treffer.length} Treffer für „{q.trim()}"</p>
          <div className="mt-3 card overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                  <th className="py-1 pr-3">Größe</th><th className="pr-3">Formel / Regel</th><th className="pr-3">Modul</th><th className="pr-3">Quelle</th><th>Rechnet in</th>
                </tr>
              </thead>
              <tbody>
                {treffer.map((e, i) => (
                  <tr key={`${e.gruppe}-${e.name}-${i}`} className="border-b border-hair align-top last:border-0">
                    <td className="py-2 pr-3 font-medium">{e.name}</td>
                    <td className="pr-3 text-neutral-700 dark:text-neutral-300">{e.formel}{e.hinweis && <span className="block text-xs text-muted">{e.hinweis}</span>}</td>
                    <td className="pr-3 text-xs">{e.gruppe}</td>
                    <td className="pr-3 text-xs text-muted">{e.quelle}</td>
                    <td className="font-mono text-[11px] text-muted">{e.code}</td>
                  </tr>
                ))}
                {treffer.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-sm text-muted">Keine KPI passt auf „{q.trim()}" — anders formulieren (z. B. „ACoS", „Marge", „CVR").</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="stagger mt-3 space-y-3">
          {gruppen.map((g) => (
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
      )}
    </>
  );
}
