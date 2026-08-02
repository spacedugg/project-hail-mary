import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";

/**
 * Produkt-Feedback (Rest von D265, radikal gekürzt in D280).
 *
 * Diese Datei rendert NUR noch das Produkt-Feedback. Alles andere, was hier
 * stand — die Driver-Liste, die Blocker-Liste, der Ballast und der Block
 * „Datenbasis & Grenzen dieser Analyse" — war nach dem Umbau auf die vier
 * Hauptaspekte (D278) eine vollständige ZWEITE Ausgabe derselben Analyse weiter
 * unten auf der Seite (Nutzer-Befund 02.08.: „warum erwähnen wir am Ende noch mal
 * Conversion Driver, obwohl wir die ganz oben schon erwähnen?"). Ein Fehler beim
 * Umbau: Der Block blieb wegen des Produkt-Feedbacks stehen, ohne dass geprüft
 * wurde, was er sonst noch alles rendert.
 *
 * Neue Zuordnung: Driver → Block 01 · Blocker und Ballast → Block 04 ·
 * Datenbasis und Grenzen → `GrenzenDerAnalyse` am Seitenende.
 *
 * Warum das Produkt-Feedback NICHT zu den vier Aspekten gehört: Es ist das
 * Ergebnis des Zuständigkeits-Gates (D266) — Themen, die kein Listing-Text und
 * kein Bild lösen kann (Verpackung, Transportschaden). Sie gehören zum
 * Hersteller, nicht in die Listing-Optimierung.
 */
export function ProduktFeedbackKachel({ lauf }: { lauf: { payload: ConversionDriverPayload } }) {
  const feedback = lauf.payload.produktFeedback;
  if (feedback.length === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Produkt-Feedback</h2>
      <p className="mt-1 text-xs text-muted">
        Themen, die kein Listing-Text löst — Produkt, Verpackung, Transport. Sie wirken auf Retouren und Bewertungen
        und gehören zum Hersteller, nicht in den Werbetext.
      </p>
      <ul className="mt-3 space-y-1.5">
        {feedback.map((f, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              <span className={f.typ === "painPoint" ? "text-bad" : "text-good"}>{f.typ === "painPoint" ? "−" : "+"}</span>{" "}
              {f.label}
            </span>
            {f.mentionCount !== null && <span className="flex-none tabular-nums text-xs text-muted">{f.mentionCount}×</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
