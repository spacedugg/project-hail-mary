import type { InsightCard } from "@/db/schema";
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";
import { MOTIV_LABELS } from "@/lib/analysis/motive";
import { kartenTendenz } from "@/lib/reviews/verdichtung";
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
  /**
   * Eindeutige Einordnung aus den Zählwerten (D280, Nutzer-Befund 02.08.:
   * „Qualität polarisiert von top bis Plastikmüll — was soll ich damit
   * anfangen? … dementsprechend musst du doch zählen und sagen: Ist das eher
   * ein positives oder ein negatives Feedback?").
   *
   * Der Code summiert die belegten Fundstellen beider Seiten und entscheidet.
   * Eine Karte, die beides bündelt, bleibt gebündelt (D171 — sonst stünde
   * dasselbe Thema zweimal da), bekommt aber ein klares Vorzeichen statt eines
   * Achselzuckens.
   */
  sentiment?: { richtung: "positiv" | "negativ" | "ausgeglichen"; positiv: number; negativ: number };
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
        {e.sentiment && (
          <span
            className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              e.sentiment.richtung === "positiv"
                ? "bg-[rgb(47_158_143/0.18)] text-good"
                : e.sentiment.richtung === "negativ"
                  ? "bg-[rgb(220_38_38/0.14)] text-bad"
                  : "bg-hair text-muted"
            }`}
            title={`${e.sentiment.positiv} positive vs. ${e.sentiment.negativ} negative Fundstellen`}
          >
            {/* D281: Klartext statt Kleinschreibung — der Nutzer will auf einen
                Blick sehen, ob ein Insight positiv oder negativ ist. */}
            {e.sentiment.richtung === "positiv" ? "▲ Positiv" : e.sentiment.richtung === "negativ" ? "▼ Negativ" : "= Ausgeglichen"}
            {" "}
            <span className="font-normal tabular-nums opacity-75">
              {e.sentiment.positiv}+ / {e.sentiment.negativ}−
            </span>
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
  fussZusatz,
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
  /** Optional unter der Liste — z. B. der Ballast bei den Blockern (D280). */
  fussZusatz?: React.ReactNode;
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
      {fussZusatz}
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

/**
 * Driver → Eintrag (entschlackt in D280).
 *
 * Vorher stand hier ein generierter Fliesstext, der mit dem Titel begann und ihn
 * praktisch wiederholte („X — das ist das Ergebnis, das Käufer erreichen wollen,
 * nicht das Merkmal, das es dafür mitbringt"), gefolgt von den Score-Anteilen als
 * grauer Block. Beides ist raus (Nutzer-Befund 02.08.: „die Beschreibung ist fast
 * komplett identisch … den grauen Text darunter kannst du auch komplett löschen,
 * bringt keinen Mehrwert").
 *
 * Was bleibt, ist das, was der Titel NICHT schon sagt: die inhaltliche
 * Begründung der Motiv-Einordnung und die Nutzen-Bausteine, die den Kaufgrund
 * tragen. Keine Wiederholung, keine Rechenprotokolle.
 */
export function driverEintraege(p: ConversionDriverPayload): VierEintrag[] {
  return p.driver.map((d) => {
    const nutzen = d.bausteine.map((b) => b.nutzen).filter(Boolean);
    const quellen = [...new Set(d.bausteine.flatMap((b) => b.belege).map((b) => QUELL_LABEL[b.quelle]))];
    const text = [
      d.motivBegruendung?.trim(),
      d.nurKategorie
        ? "Dieser Kaufgrund steht als Pflicht-Driver der Kategorie im Set — die eigene Datenlage dafür ist dünn."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      titel: d.resultat,
      text: text || "Für diesen Kaufgrund liegt keine ausformulierte Einordnung vor.",
      relevanz: d.relevanz,
      notiz: MOTIV_LABELS[d.motivKlasse],
      // Nur die Nutzen-Bausteine und Belegquellen — keine Score-Anteile.
      belege: [
        ...nutzen.map((n) => `Nutzen: ${n}`),
        quellen.length ? `Belegt über ${quellen.join(", ")}` : "",
      ].filter(Boolean),
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

/**
 * Insight-/Feature-Karten → Eintrag. `beschreibung` IST der Fließtext (D132).
 *
 * `mitSentiment` nur für Review Insights (D280): Dort will der Nutzer eine klare
 * Einordnung, weil eine Karte wie „Qualität polarisiert — von top bis
 * Plastikmüll" ohne Vorzeichen unbrauchbar ist. Bei Produkt-Features bleibt es
 * bewusst aus (D272): Ein Merkmal ist ein Merkmal.
 */
export function kartenEintraege(karten: InsightCard[], mitSentiment = false): VierEintrag[] {
  return karten.map((k) => {
    const t = mitSentiment ? kartenTendenz(k) : null;
    return {
      titel: k.titel,
      text: k.beschreibung,
      relevanz: k.relevanz,
      notiz: k.belegAspekte.length ? `${k.belegAspekte.length} Beleg${k.belegAspekte.length === 1 ? "" : "e"}` : undefined,
      sentiment: t ?? undefined,
      belege: k.belegAspekte.map((b) => {
        const zahl = b.mentionCount !== null ? ` (${b.mentionCount}×)` : "";
        const fremd = b.herkunft && b.herkunft.eigene === 0 && b.herkunft.fremde > 0 ? " — nur bei Wettbewerbern belegt" : "";
        return `${b.typ === "painPoint" ? "−" : "+"} ${b.label}${zahl}${fremd}`;
      }),
    };
  });
}

/**
 * Merkmal-Einordnung unter den Blockern (D282) — ERSETZT die frühere
 * „Merkmale ohne Kaufgrund"-Liste.
 *
 * Die alte Liste behauptete, sieben von neun Merkmalen kosteten nur
 * Aufmerksamkeit — darunter „Erwärmt Aufstellpool mit Sonnenkraft" bei einem
 * Kaufgrund „Poolwasser wird angenehm warm zum Baden". Ursache war ein exakter
 * Token-Vergleich UND eine falsche Prämisse: Passungs- und Mengenangaben zahlen
 * auf keinen Kaufgrund ein, MÜSSEN aber im Listing stehen.
 *
 * Jetzt zählt nur noch als Befund, was die Einordnung ausdrücklich als
 * zweckfrei erkennt. Notwendige Angaben werden neutral daneben gestellt — als
 * Bestätigung, nicht als Mangel. Merkmale ohne Klasse (Alt-Läufe) erscheinen
 * gar nicht: keine Einordnung, keine Behauptung.
 */
export function MerkmalEinordnung({ merkmale }: { merkmale: ConversionDriverPayload["ballast"] }) {
  const ballast = merkmale.filter((m) => m.klasse === "ballast");
  const notwendig = merkmale.filter((m) => m.klasse === "notwendige_spezifikation");
  if (ballast.length === 0 && notwendig.length === 0) return null;

  return (
    <div className="mt-5 border-t border-hair pt-4">
      {ballast.length > 0 ? (
        <>
          <h3 className="text-sm font-semibold">Angaben ohne erkennbaren Zweck</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Diese Angaben stützen keinen Kaufgrund und sind auch keine Pflichtinformation — hier ließe sich Platz für ein
            Kaufargument gewinnen.
          </p>
          <ul className="mt-2 space-y-1.5">
            {ballast.map((m, i) => (
              <li key={i} className="text-sm leading-snug">
                · {m.feature}
                {m.fundstelle === "prominent" && <span className="ml-1.5 text-[11px] text-bad">an prominenter Stelle</span>}
                {m.begruendung && <span className="mt-0.5 block text-[11px] text-muted">{m.begruendung}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm">✓ Keine überflüssigen Angaben im Listing — jedes Merkmal stützt einen Kaufgrund oder ist eine notwendige Information.</p>
      )}

      {notwendig.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            Notwendige Angaben ohne Kaufgrund-Bezug ({notwendig.length}) — kein Mangel
          </summary>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Passung, Mengen, Material, Anwendungshinweise: Sie zahlen auf keinen Kaufgrund ein, müssen aber im Listing
            stehen — ohne sie kann niemand prüfen, ob das Produkt zur eigenen Situation passt.
          </p>
          <ul className="mt-2 space-y-1">
            {notwendig.map((m, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted">· {m.feature}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
