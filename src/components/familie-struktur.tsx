import Link from "next/link";
import type { FamilienDaten } from "@/lib/variants/laden";

/**
 * Struktur-Überblick einer Variations-Familie (D256, Nutzer-Vorgabe): Parent samt
 * allen Varianten — sichtbar auf JEDER Parent- UND Child-ASIN ganz oben im
 * Content-Bereich, damit man immer weiß, in welcher Struktur man sich befindet.
 *
 * Bewusst REIN LESEND und ohne "use client": Ableiten, Slots bestätigen und
 * Übertragen sind Parent-Aufgaben und bleiben im `FamilieManager` darunter.
 * Die aktuell geöffnete Variante ist hervorgehoben.
 */
export function FamilieStruktur({ familie, aktuellId }: { familie: FamilienDaten; aktuellId: string }) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Variations-Familie</p>
          <p className="text-sm font-semibold">{familie.name}</p>
        </div>
        <p className="text-[11px] text-muted">
          Achse(n): <b>{familie.theme.join(", ") || "—"}</b> · {familie.kinder.length} Varianten ·{" "}
          {familie.hatMaster ? "Master freigegeben ✓" : "noch kein Master"}
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3">Variante</th>
              <th className="py-1.5 pr-3">Achsenwerte</th>
              <th className="py-1.5 pr-3">Content</th>
            </tr>
          </thead>
          <tbody>
            {familie.kinder.map((k) => {
              const aktuell = k.id === aktuellId;
              return (
                <tr key={k.id} className={`border-b border-hair/60 last:border-0 ${aktuell ? "bg-[var(--primary-soft)]" : ""}`}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2.5">
                      {k.bildUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={k.bildUrl} alt="" className="h-8 w-8 flex-none rounded border border-hair bg-white object-contain" />
                      ) : (
                        <div className="grid h-8 w-8 flex-none place-items-center rounded border border-hair bg-neutral-100 text-[10px] text-muted dark:bg-neutral-800">–</div>
                      )}
                      <div className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {aktuell ? (
                            <span className="font-mono text-[13px] font-bold text-primary-strong">{k.asin ?? "—"}</span>
                          ) : (
                            <Link href={`/produkte/${k.id}?tab=content`} className="font-mono text-[13px] underline">{k.asin ?? "—"}</Link>
                          )}
                          {k.istKopf && <span className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] text-primary-strong">Parent</span>}
                          {aktuell && <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] text-[var(--surface)]">hier</span>}
                        </span>
                        {k.titel && k.titel !== k.asin && (
                          <span className="block max-w-[42vw] truncate text-[11px] text-muted" title={k.titel}>{k.titel}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs">{familie.theme.map((a) => `${a}: ${k.axisValues[a] ?? "—"}`).join(" · ")}</td>
                  <td className="py-2 pr-3 text-xs">
                    {k.hatFreigegebenenContent ? <span className="text-good">freigegeben</span> : <span className="text-muted">offen</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
