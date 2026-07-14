/**
 * Leichte SVG-Chart-Bausteine (Server-tauglich, CSS-animiert).
 * dataviz-Regeln: Kategorien-Farben in FESTER Reihenfolge (--cat-1…4, validiert),
 * 2px-Lücken zwischen Segmenten, Legende + Direktlabels, Text in Text-Farben.
 */

const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)"];

export function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Array<{ label: string; value: number; detail?: string }>;
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const R = 15.9155; // Umfang 100
  const GAP = segments.length > 1 ? 2 : 0; // 2px Lücke zwischen Segmenten
  let offset = 0; // Start bei 12 Uhr (svg um −90° gedreht), im Uhrzeigersinn
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-36 w-36 flex-none">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
          {segments.map((s, i) => {
            const len = Math.max(0, (s.value / total) * 100 - GAP);
            const el = (
              <circle
                key={s.label}
                cx="21" cy="21" r={R}
                fill="none"
                stroke={CAT[i % CAT.length]}
                strokeWidth="4.6"
                strokeLinecap="round"
                strokeDasharray={`${len} ${100 - len}`}
                strokeDashoffset={-offset}
                className="donut-seg"
                style={{ ["--donut-full" as string]: `${100 - offset}`, animationDelay: `${0.15 + i * 0.12}s` }}
              />
            );
            offset += (s.value / total) * 100;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold tabular-nums tracking-tight">{centerValue}</div>
          <div className="text-[10px] text-muted">{centerLabel}</div>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: CAT[i % CAT.length] }} />
            <span className="font-medium">{s.label}</span>
            <span className="ml-auto tabular-nums text-muted">
              {s.detail ?? ""} · {total > 0 ? Math.round((s.value / total) * 100) : 0} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontaler Mini-Balken (sequentiell, eine Farbe) — für Tabellen-Spalten. */
export function MiniBar({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-hair ${className}`}>
      <div
        className="bar-fill h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--primary-strong))]"
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
