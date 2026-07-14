/**
 * Perioden-Diagnose — EIGENE Denkarbeit, kein Bestands-Port (D64).
 * These des Nutzers: Bestands-Tools zeigen KPIs isoliert; der holistische
 * Blick fehlt. Diese Diagnose beantwortet „Umsatz hat sich verändert — WARUM?"
 * in zwei Stufen:
 *
 * 1. ZERLEGUNG: Umsatz = Sitzungen × CVR × AOV. Die Veränderung wird über
 *    logarithmische Anteile exakt auf die drei Faktoren verteilt
 *    (ln-Zerlegung: Σ Faktor-Beiträge = Gesamt-Delta, ohne Rest).
 * 2. URSACHEN-ABGLEICH quer über die Module: Buybox-Verlust, Werbe-
 *    abhängigkeit (TACoS/PPC-Anteil), Sichtbarkeitslücken (SOV) — jede
 *    Diagnose nennt Befund, Evidenz und den nächsten Schritt im Tool.
 *
 * Deterministisch und erklärbar — jede Aussage ist nachrechenbar (Rechenwerk).
 */

import type { TrendRow } from "./trends";

export type RevenueDecomposition = {
  deltaEur: number;
  deltaPct: number; // %
  // Beitrag je Faktor in € (Summe = deltaEur) und als Anteil am Delta
  factors: Array<{ key: "sessions" | "cvr" | "aov"; label: string; eur: number; sharePct: number }>;
};

/** ln-Zerlegung: exakt, ohne Interaktions-Rest; null wenn mathematisch nicht sauber möglich. */
export function decomposeRevenueDelta(
  prev: { revenue: number; sessions: number; orders: number },
  curr: { revenue: number; sessions: number; orders: number },
): RevenueDecomposition | null {
  const vals = [prev.revenue, prev.sessions, prev.orders, curr.revenue, curr.sessions, curr.orders];
  if (vals.some((v) => !(v > 0))) return null; // Nullen/Negative: Zerlegung wäre erfunden

  const f = (p: number, c: number) => Math.log(c / p);
  const parts = [
    { key: "sessions" as const, label: "Traffic (Sitzungen)", ln: f(prev.sessions, curr.sessions) },
    { key: "cvr" as const, label: "Conversion (CVR)", ln: f(prev.orders / prev.sessions, curr.orders / curr.sessions) },
    { key: "aov" as const, label: "Warenkorb (AOV)", ln: f(prev.revenue / prev.orders, curr.revenue / curr.orders) },
  ];
  const totalLn = f(prev.revenue, curr.revenue);
  const deltaEur = curr.revenue - prev.revenue;
  const deltaPct = (curr.revenue / prev.revenue - 1) * 100;

  // Keine Veränderung → alle Beiträge 0
  const factors = parts.map((p) => {
    const share = Math.abs(totalLn) < 1e-12 ? 0 : p.ln / totalLn;
    return {
      key: p.key,
      label: p.label,
      eur: Math.round(share * deltaEur * 100) / 100,
      sharePct: Math.round(share * 1000) / 10,
    };
  });
  return { deltaEur: Math.round(deltaEur * 100) / 100, deltaPct: Math.round(deltaPct * 10) / 10, factors };
}

export type DiagnoseFinding = {
  befund: string;
  evidenz: string; // die konkreten Zahlen dahinter
  nextStep: string; // wohin im Tool
  severity: "good" | "warn" | "bad";
};

export type PeriodDiagnose = {
  vorher: string;
  nachher: string;
  decomposition: RevenueDecomposition | null;
  findings: DiagnoseFinding[];
};

const pct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} %`;
const eur = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n)} €`;

/**
 * Ursachen-Abgleich der letzten beiden Perioden quer über die Signale.
 * Regeln sind bewusst konservativ: nur benennen, was die Daten belegen —
 * und ehrlich sagen, welches Signal zur Klärung fehlt.
 */
export function diagnosePeriods(
  rows: TrendRow[],
  ctx: { sovQuickWins?: number; sovGapEur?: number; breakEven?: number | null } = {},
): PeriodDiagnose | null {
  if (rows.length < 2) return null;
  const prev = rows[rows.length - 2];
  const curr = rows[rows.length - 1];
  const dec = decomposeRevenueDelta(prev, curr);
  const findings: DiagnoseFinding[] = [];

  const dominant = dec ? [...dec.factors].sort((a, b) => Math.abs(b.eur) - Math.abs(a.eur))[0] : null;
  const down = dec !== null && dec.deltaEur < 0;

  // 1) Traffic-getrieben → Sichtbarkeit prüfen (SOV verbindet sich mit dem Reporting)
  if (dominant?.key === "sessions") {
    if (down && (ctx.sovQuickWins ?? 0) > 0) {
      findings.push({
        befund: "Der Rückgang ist primär ein Sichtbarkeits-/Traffic-Problem — und das SOV-Audit zeigt offene Ranking-Lücken.",
        evidenz: `Traffic-Beitrag ${eur(dominant.eur)} von ${eur(dec!.deltaEur)} Gesamt-Delta · ${ctx.sovQuickWins} Quick Wins offen${ctx.sovGapEur ? ` · Lücken-Potenzial bis ${eur(ctx.sovGapEur)}/Mo` : ""}`,
        nextStep: "Sichtbarkeit & Markt → Quick Wins; Content-Handlungen priorisieren",
        severity: "bad",
      });
    } else {
      findings.push({
        befund: down ? "Der Rückgang kommt primär über weniger Traffic, nicht über die Conversion." : "Das Wachstum kommt primär über mehr Traffic.",
        evidenz: `Sitzungen ${prev.sessions.toLocaleString("de-DE")} → ${curr.sessions.toLocaleString("de-DE")} (Beitrag ${eur(dominant.eur)})`,
        nextStep: down ? "Cerebro-CSV aktualisieren → SOV-Audit zeigt, wo Rankings verloren gingen" : "Rankings halten: Defend-Keywords im SOV-Audit prüfen",
        severity: down ? "warn" : "good",
      });
    }
  }

  // 2) Conversion-getrieben → Buybox zuerst, sonst Listing/Preis
  if (dominant?.key === "cvr") {
    const bbDelta = prev.buyBoxPct !== null && curr.buyBoxPct !== null ? curr.buyBoxPct - prev.buyBoxPct : null;
    if (down && bbDelta !== null && bbDelta <= -2) {
      findings.push({
        befund: "Conversion-Rückgang fällt mit Buybox-Verlust zusammen — zuerst die Buybox klären, nicht das Listing umbauen.",
        evidenz: `CVR-Beitrag ${eur(dominant.eur)} · Buybox ${pct(prev.buyBoxPct!)} → ${pct(curr.buyBoxPct!)}`,
        nextStep: "Buybox-Ursachen prüfen (Preis, Verfügbarkeit, Konto-Zustand)",
        severity: "bad",
      });
    } else {
      findings.push({
        befund: down
          ? "Conversion ist der Haupttreiber des Rückgangs — Buybox ist stabil, also Listing/Preis/Wettbewerb ansehen."
          : "Das Wachstum kommt primär über bessere Conversion.",
        evidenz: `CVR ${prev.cvr ?? "–"} % → ${curr.cvr ?? "–"} % (Beitrag ${eur(dominant.eur)})${bbDelta !== null ? ` · Buybox ${bbDelta >= 0 ? "+" : ""}${pct(bbDelta)}` : " · Buybox-Signal fehlt"}`,
        nextStep: down ? "SQP: Eure CVR vs. Markt je Suchanfrage; Review-Insights auf neue Pain Points prüfen" : "Treiber sichern: freigegebenen Content nicht ungeprüft ändern",
        severity: down ? "warn" : "good",
      });
    }
  }

  // 3) AOV-getrieben → Preis/Mix
  if (dominant?.key === "aov") {
    findings.push({
      befund: down ? "Der Warenkorb-Wert drückt den Umsatz — Preis- oder Produktmix-Verschiebung." : "Höherer Warenkorb-Wert trägt das Wachstum.",
      evidenz: `AOV ${eur(prev.revenue / prev.orders)} → ${eur(curr.revenue / curr.orders)} (Beitrag ${eur(dominant.eur)})`,
      nextStep: "Preise/Aktionen der Periode prüfen; Margen-Kalkulation bei Preisänderung aktualisieren",
      severity: down ? "warn" : "good",
    });
  }

  // 4) Werbeabhängigkeit unabhängig vom Umsatz-Delta bewerten (TACoS-Bewegung + Break-even)
  if (prev.tacos !== null && curr.tacos !== null) {
    const tDelta = curr.tacos - prev.tacos;
    const over = ctx.breakEven != null && curr.tacos >= ctx.breakEven;
    if (over) {
      findings.push({
        befund: "TACoS liegt über dem Break-even — Wachstum wird aktuell unprofitabel erkauft.",
        evidenz: `TACoS ${pct(curr.tacos)} ≥ Break-even ${pct(ctx.breakEven!)}`,
        nextStep: "Advertising: Kampagnen über Ziel-ACoS & Negativ-Kandidaten abarbeiten",
        severity: "bad",
      });
    } else if (tDelta >= 2 && !down) {
      findings.push({
        befund: "Der Umsatz wächst, aber die Werbeabhängigkeit wächst mit — organischer Anteil sinkt.",
        evidenz: `TACoS ${pct(prev.tacos)} → ${pct(curr.tacos)} (+${pct(tDelta)}) bei Umsatz +${pct(dec?.deltaPct ?? 0)}`,
        nextStep: "SOV-Audit: organische Rankings für die Top-Spend-Keywords aufbauen",
        severity: "warn",
      });
    } else if (tDelta <= -1) {
      findings.push({
        befund: "Werbeabhängigkeit sinkt — mehr Umsatz kommt organisch.",
        evidenz: `TACoS ${pct(prev.tacos)} → ${pct(curr.tacos)}`,
        nextStep: "Kurs halten; freiwerdendes Budget in Strategic Gaps testen",
        severity: "good",
      });
    }
  } else if (curr.spend === null) {
    findings.push({
      befund: "Werbe-Signal fehlt für diese Periode — die Diagnose ist nur halb vollständig.",
      evidenz: "Kein Ads-Bericht mit passender Periode hochgeladen",
      nextStep: "Berichte & Daten → Ads-Bericht der Periode nachladen",
      severity: "warn",
    });
  }

  return {
    vorher: prev.label,
    nachher: curr.label,
    decomposition: dec,
    findings,
  };
}
