import type { InsightCard } from "@/db/schema";
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";
import { MOTIV_LABELS } from "@/lib/analysis/motive";
import { QUELL_LABEL } from "@/lib/analysis/driverTypen";

/**
 * Die VIER Hauptaspekte des Analyse-Reiters (D278, Nutzer-Vorgabe 02.08.2026)
 * — in genau dieser Reihenfolge, ganz oben, einheitlich dargestellt:
 *
 *   1 CONVERSION DRIVERS   what makes people buy
 *   2 REVIEW INSIGHTS      what matters to customers
 *   3 PRODUCT FEATURES     features that drive purchase decisions
 *   4 CONVERSION BLOCKERS  what shoppers don't see but care about
 *
 * Warum eine gemeinsame Komponente: Die vier Rubriken sind vier Sichten auf
 * dieselbe Kette, keine vier Bauteile. Sie müssen deshalb gleich aussehen und
 * sich gleich verhalten — Rang, Kurztitel, Aufklappen, Fließtext. Vorher waren
 * es drei verschiedene Darstellungen an drei Stellen der Seite.
 *
 * Jeder Eintrag ist aufklappbar und trägt einen FLIESSTEXT (Nutzer: „dann habe
 * ich dort das Problem noch mal mit Fließtext beschrieben"). Der Text ist bei
 * Drivern und Blockern deterministisch gebaut (D184) und bei Review Insights und
 * Features die verdichtete `beschreibung` — nie ein Platzhalter.
 *
 * Die Abgrenzung, die der Nutzer ausdrücklich betont: Ein Conversion-Blocker ist
 * KEIN umformulierter Driver. Der Driver sagt, warum jemand kauft; der Blocker
 * sagt, was Käufer wissen wollen und im Listing samt Bildern nicht finden.
 * Deshalb trägt jeder Blocker sichtbar den Kaufgrund, an dem er hängt.
 */

export type VierEintrag = {
  /** Kurztitel für die Listenzeile. */
  titel: string;
  /** Fließtext beim Aufklappen — mehrere Sätze, nie ein Fragment. */
  text: string;
  /** 1–5, füllt die Relevanz-Punkte. */
  relevanz?: number;
  /** Kleine Randnotiz rechts in der Kopfzeile (Beleg-Zahl, Bezug, Quelle). */
  notiz?: string;
  /** Zusatzzeilen im aufgeklappten Zustand (Belege, Kanäle, Zitate). */
  belege?: string[];
};

function Eintrag({ e, rang }: { e: VierEintrag; rang: number }) {
  return (
    <details className="dok-finding group rounded-xl border border-hair bg-background">
      <summary className="flex cursor-pointer list-none items-baseline gap-2.5 p-3">
        <span className="flex-none rounded-md bg-hair px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted">
          #{rang}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{e.titel}</span>
        {e.relevanz !== undefined && (
          <span className="flex-none text-[11px] tracking-[0.15em] text-primary-strong" title={`Relevanz ${e.relevanz}/5`}>
            {"●".repeat(e.relevanz)}
            <span className="opacity-25">{"●".repeat(Math.max(0, 5 - e.relevanz))}</span>
          </span>
        )}
        {e.notiz && <span className="flex-none text-[11px] tabular-nums text-muted">{e.notiz}</span>}
        <span className="flex-none text-muted transition group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-hair p-3">
        <p className="text-sm leading-relaxed">{e.text}</p>
        {e.belege && e.belege.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {e.belege.map((b, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted">· {b}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function VierBlock({
  nr,
  kuerzel,
  titel,
  claim,
  erklaerung,
  eintraege,
  leerText,
  kopfZusatz,
}: {
  nr: number;
  kuerzel: string;
  titel: string;
  /** Die eine Zeile, die sagt, wofür die Rubrik steht. */
  claim: string;
  /** Zwei bis drei Sätze: was die Rubrik beantwortet und wozu sie dient. */
  erklaerung: string;
  eintraege: VierEintrag[];
  leerText: string;
  /** Optional über der Liste — z. B. der Trichter bei den Review Insights. */
  kopfZusatz?: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="dok-kapitelkopf">
        <span className="dok-nummer">{String(nr).padStart(2, "0")}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold uppercase tracking-wide">{titel}</h2>
            <span className="rounded-full bg-hair px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">{kuerzel}</span>
            <span className="text-xs text-muted">({eintraege.length})</span>
          </div>
          <p className="mt-0.5 text-sm font-medium">{claim}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{erklaerung}</p>

      {kopfZusatz}

      <div className="stagger mt-4 space-y-2">
        {eintraege.map((e, i) => (
          <Eintrag key={i} e={e} rang={i + 1} />
        ))}
        {eintraege.length === 0 && <p className="text-sm text-muted">{leerText}</p>}
      </div>
    </section>
  );
}

/**
 * Trichter der Review-Auswertung (D278, Nutzer: „bei den Review Insights würde
 * ich mir gerne eine diagrammhafte Darstellung wünschen über die Anzahl an
 * analysierten Reviews, dann die daraus generierten Review-Aspekte und die
 * daraus generierten Insights").
 *
 * Der Trichter macht die Abstraktionsstufen sichtbar: Insights sind eben NICHT
 * zusammengefasste Reviews, sondern das, was sich aus den Roh-Aspekten ableiten
 * lässt. Die Balkenbreite ist proportional zur größten Stufe — echte Zahlen,
 * keine Deko.
 */
export function ReviewTrichter({
  reviews,
  aspekte,
  insights,
}: {
  reviews: number;
  aspekte: number;
  insights: number;
}) {
  const stufen = [
    { label: "Bewertungen ausgewertet", wert: reviews, hinweis: "Rohmaterial" },
    { label: "Roh-Aspekte erkannt", wert: aspekte, hinweis: "wiederkehrende Themen, wörtlich belegt" },
    { label: "Insights abgeleitet", wert: insights, hinweis: "verdichtet — was daraus für den Kauf folgt" },
  ];
  const max = Math.max(...stufen.map((s) => s.wert), 1);
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

  return (
    <div className="mt-4 rounded-xl border border-hair p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Von der Bewertung zur Erkenntnis</div>
      <div className="mt-3 space-y-2.5">
        {stufen.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-44 flex-none text-xs leading-snug">{s.label}</span>
            <div className="min-w-0 flex-1">
              <div
                className="flex h-7 items-center rounded-md bg-[var(--primary)] px-2 text-xs font-semibold text-white"
                style={{ width: `${Math.max(8, Math.round((s.wert / max) * 100))}%`, opacity: 1 - i * 0.22 }}
              >
                {fmt(s.wert)}
              </div>
            </div>
            <span className="hidden w-56 flex-none text-[11px] leading-snug text-muted sm:block">{s.hinweis}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Driver → Eintrag. Der Fließtext entsteht aus Motiv, Bausteinen und Belegen. */
export function driverEintraege(p: ConversionDriverPayload): VierEintrag[] {
  return p.driver.map((d) => {
    const nutzen = d.bausteine.map((b) => b.nutzen).filter(Boolean);
    const quellen = [...new Set(d.bausteine.flatMap((b) => b.belege).map((b) => QUELL_LABEL[b.quelle]))];
    const text = [
      `${d.resultat} — das ist das Ergebnis, das Käufer mit diesem Produkt erreichen wollen, nicht das Merkmal, das es dafür mitbringt.`,
      d.motivBegruendung?.trim() ? `Eingeordnet als ${MOTIV_LABELS[d.motivKlasse]}: ${d.motivBegruendung.trim()}` : `Eingeordnet als ${MOTIV_LABELS[d.motivKlasse]}.`,
      nutzen.length ? `Getragen wird der Kaufgrund von ${nutzen.length === 1 ? "diesem Nutzen" : "diesen Nutzen-Bausteinen"}: ${nutzen.join(" · ")}.` : "",
      quellen.length ? `Belegt über ${quellen.join(", ")}.` : "",
      d.nurKategorie
        ? "Achtung: Dieser Kaufgrund steht als Pflicht-Driver der Kategorie im Set — die eigene Datenlage dafür ist dünn."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      titel: d.resultat,
      text,
      relevanz: d.relevanz,
      notiz: MOTIV_LABELS[d.motivKlasse],
      belege: d.anteile.map((a) => `${a.quelle}: ${a.punkte} Punkte — ${a.beleg}`),
    };
  });
}

/** Blocker → Eintrag. Trägt sichtbar den Kaufgrund, an dem die Lücke hängt. */
export function blockerEintraege(p: ConversionDriverPayload): VierEintrag[] {
  const resultatVon = new Map(p.driver.map((d) => [d.id, d.resultat]));
  return p.blocker.map((b) => ({
    titel: b.titel,
    // Alt-Läufe ohne `begruendung` (vor D278) bekommen keinen erfundenen Text,
    // sondern den ehrlichen Hinweis, dass der Lauf älter ist.
    text:
      b.begruendung?.trim() ||
      "Für diesen Blocker liegt noch keine ausformulierte Begründung vor — sie entsteht beim nächsten Analyse-Lauf.",
    notiz: `betrifft ${b.driverId}`,
    belege: [
      resultatVon.get(b.driverId) ? `Kaufgrund: ${resultatVon.get(b.driverId)}` : "",
      b.bildSlot !== undefined ? `Betroffenes Bild: Slot ${b.bildSlot}` : "",
      b.praezisierung?.trim() ? `Aus Kundenstimmen: ${b.praezisierung.trim()}` : "",
    ].filter(Boolean),
  }));
}

/** Insight-/Feature-Karten → Eintrag. `beschreibung` IST der Fließtext (D132). */
export function kartenEintraege(karten: InsightCard[]): VierEintrag[] {
  return karten.map((k) => ({
    titel: k.titel,
    text: k.beschreibung,
    relevanz: k.relevanz,
    notiz: k.belegAspekte.length ? `${k.belegAspekte.length} Beleg${k.belegAspekte.length === 1 ? "" : "e"}` : undefined,
    belege: k.belegAspekte.map((b) => {
      const zahl = b.mentionCount !== null ? ` (${b.mentionCount}×)` : "";
      const fremd = b.herkunft && b.herkunft.eigene === 0 && b.herkunft.fremde > 0 ? " — nur bei Wettbewerbern belegt" : "";
      return `${b.typ === "painPoint" ? "−" : "+"} ${b.label}${zahl}${fremd}`;
    }),
  }));
}
