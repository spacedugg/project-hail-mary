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

/**
 * Verlaufslinie (StageLine-Muster aus reporting-main): Linie + weiche Fläche,
 * Wertlabel an jedem Punkt, optionale gestrichelte Referenzlinie.
 * Nur mit ≥ 2 echten Datenpunkten rendern (keine Fake-Trends — dataviz-Regel).
 */
export function TrendLine({
  points,
  refLine,
  unit = "",
  color = "var(--primary)",
}: {
  points: Array<{ label: string; value: number }>;
  refLine?: { value: number; label: string };
  unit?: string;
  color?: string;
}) {
  if (points.length < 2) return null;
  const W = 640, H = 190, PAD_X = 26, PAD_TOP = 26, PAD_BOT = 34;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values, refLine?.value ?? Infinity);
  const hi = Math.max(...values, refLine?.value ?? -Infinity);
  const span = hi - lo || 1;
  const y = (v: number) => PAD_TOP + (H - PAD_TOP - PAD_BOT) * (1 - (v - lo + span * 0.08) / (span * 1.16));
  const x = (i: number) => PAD_X + ((W - 2 * PAD_X) * i) / (points.length - 1);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${PAD_X},${H - PAD_BOT} ${line} ${W - PAD_X},${H - PAD_BOT}`;
  const fmt = (v: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <polygon points={area} fill={color} opacity="0.08" />
      {refLine && (
        <>
          <line x1={PAD_X} x2={W - PAD_X} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 4" />
          <text x={W - PAD_X} y={y(refLine.value) - 5} textAnchor="end" fontSize="10" fill="var(--muted)">{refLine.label}</text>
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        className="donut-seg"
        style={{ ["--donut-full" as string]: "1" }}
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
          <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)">
            {fmt(p.value)}{unit}
          </text>
          <text x={x(i)} y={H - 14} textAnchor="middle" fontSize="10" fill="var(--muted)">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Mini-Sparkline für KPI-Kacheln — NUR mit echter Zeitreihe (≥ 3 Punkte) rendern. */
export function Sparkline({ values, color = "var(--primary)" }: { values: number[]; color?: string }) {
  if (values.length < 3) return null;
  const W = 96, H = 30, P = 3;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => P + ((W - 2 * P) * i) / (values.length - 1);
  const y = (v: number) => P + (H - 2 * P) * (1 - (v - lo) / span);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-24" aria-hidden>
      <polygon points={`${P},${H - P} ${pts} ${W - P},${H - P}`} fill={color} opacity="0.1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Gestapelte Perioden-Balken (Referenz-Look: runde Enden, 2px-Lücken,
 * Hintergrund-Track). Segmente in fester Farb-Reihenfolge; Direktlabel = Summe.
 */
export function StackedBars({
  periods,
  legend,
  unit = "",
}: {
  periods: Array<{ label: string; segments: number[] }>;
  legend: string[]; // feste Reihenfolge = CAT-Farben
  unit?: string;
}) {
  if (periods.length < 2) return null;
  const max = Math.max(...periods.map((p) => p.segments.reduce((s, x) => s + x, 0)), 1);
  const fmt = (v: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v);
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height: 180 }}>
        {periods.map((p) => {
          const total = p.segments.reduce((s, x) => s + x, 0);
          return (
            <div key={p.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-semibold tabular-nums">{fmt(total)}{unit}</span>
              <div className="relative flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-full bg-hair" style={{ height: "calc(100% - 34px)" }}>
                {p.segments.map((v, i) => (
                  <div
                    key={i}
                    className="bar-fill-y w-full"
                    style={{
                      height: `${(v / max) * 100}%`,
                      background: CAT[i % CAT.length],
                      marginTop: i < p.segments.length - 1 && v > 0 ? 2 : 0,
                      borderRadius: i === p.segments.length - 1 ? "9999px 9999px 0 0" : 0,
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-muted">{p.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        {legend.map((l, i) => (
          <span key={l} className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT[i % CAT.length] }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Opportunity-Matrix (temoa-tools-beta §3.8): X = Suchvolumen (log),
 * Y = Sichtbarkeit %, Punktgröße = Umsatzpotenzial, Farbe = Opportunity-Typ
 * (feste Zuordnung, nie rotiert). Direktlabels für die Top-Punkte.
 */
const OPP_COLORS: Record<string, string> = {
  "Quick Win": "var(--cat-2)",
  "Strategic Gap": "var(--cat-1)",
  "Strong Position": "#5a8dee",
  Defend: "var(--cat-3)",
  Monitor: "var(--muted)",
};

export function OpportunityMatrix({
  points,
}: {
  points: Array<{ keyword: string; sv: number; visibility: number; potential: number; type: string }>;
}) {
  const data = points.filter((p) => p.sv > 0).slice(0, 200);
  if (data.length < 3) return null;
  const W = 760, H = 320, PL = 46, PR = 16, PT = 16, PB = 40;
  const lx = (v: number) => Math.log10(Math.max(1, v));
  const xLo = Math.min(...data.map((p) => lx(p.sv))), xHi = Math.max(...data.map((p) => lx(p.sv)));
  const yHi = Math.max(...data.map((p) => p.visibility), 10);
  const maxPot = Math.max(...data.map((p) => p.potential), 1);
  const x = (v: number) => PL + ((W - PL - PR) * (lx(v) - xLo)) / (xHi - xLo || 1);
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / (yHi * 1.08));
  const r = (v: number) => 4 + Math.sqrt(v / maxPot) * 14;
  const topLabels = [...data].sort((a, b) => b.potential - a.potential).slice(0, 5);
  const types = [...new Set(data.map((p) => p.type))];
  const fmt = (v: number) => new Intl.NumberFormat("de-DE", { notation: "compact" }).format(v);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Gitter dezent */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PL} x2={W - PR} y1={PT + (H - PT - PB) * f} y2={PT + (H - PT - PB) * f} stroke="var(--hair)" strokeWidth="1" />
        ))}
        <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="var(--hair)" strokeWidth="1.5" />
        <line x1={PL} x2={PL} y1={PT} y2={H - PB} stroke="var(--hair)" strokeWidth="1.5" />
        <text x={PL - 8} y={PT + 8} textAnchor="end" fontSize="10" fill="var(--muted)">{Math.round(yHi)} %</text>
        <text x={PL - 8} y={H - PB} textAnchor="end" fontSize="10" fill="var(--muted)">0</text>
        <text x={PL} y={H - PB + 16} fontSize="10" fill="var(--muted)">{fmt(Math.round(10 ** xLo))}</text>
        <text x={W - PR} y={H - PB + 16} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(Math.round(10 ** xHi))} Suchvolumen/Monat (log)</text>
        <text x={14} y={PT + (H - PT - PB) / 2} fontSize="10" fill="var(--muted)" transform={`rotate(-90 14 ${PT + (H - PT - PB) / 2})`} textAnchor="middle">Sichtbarkeit %</text>
        {data.map((p) => (
          <circle key={p.keyword} cx={x(p.sv)} cy={y(p.visibility)} r={r(p.potential)} fill={OPP_COLORS[p.type] ?? "var(--muted)"} opacity="0.75" stroke="var(--surface)" strokeWidth="1.5">
            <title>{`${p.keyword} · SV ${fmt(p.sv)} · Sichtbarkeit ${p.visibility} % · Potenzial ${fmt(p.potential)} €/Mo · ${p.type}`}</title>
          </circle>
        ))}
        {topLabels.map((p) => {
          // Label im Zeichenbereich halten (Ränder klemmen)
          const cx = Math.min(Math.max(x(p.sv), PL + 60), W - PR - 60);
          return (
            <text key={`l-${p.keyword}`} x={cx} y={Math.max(PT + 10, y(p.visibility) - r(p.potential) - 4)} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--foreground)">
              {p.keyword.length > 22 ? `${p.keyword.slice(0, 21)}…` : p.keyword}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4">
        {types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPP_COLORS[t] ?? "var(--muted)" }} />
            {t}
          </span>
        ))}
        <span className="text-[11px] text-muted">Punktgröße = Umsatzpotenzial €/Monat (Basis-Korridor)</span>
      </div>
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
