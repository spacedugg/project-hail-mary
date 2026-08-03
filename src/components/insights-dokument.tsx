import type { Ampel, InsightsReportPayload } from "@/lib/reports/insightsDokument";

/**
 * Darstellung des Insights-Dokuments (D267, neu aufgebaut in D277) — dieselbe
 * Seite ist der Ausdruck. Kein zweites Layout für PDF: die Print-Regeln stehen
 * in `globals.css` (`.dok-seite`), damit Bildschirm und Papier nie
 * auseinanderlaufen.
 *
 * Kapitelfolge (Nutzer-Vorgabe, Stand D283):
 *   1 Titelblock: Marke, Produkt, Kernthese, Zielgruppe/Positionierung, Datenbasis
 *   2 Was Kunden sagen — positive und negative Findings mit Beleg
 *   3 Was das Produkt auszeichnet — belegbare USPs
 *   4 Warum Kunden kaufen — Kaufgrund-Matrix mit Abdeckungs-Ampel
 *   5 Was den Kauf heute blockiert — Blocker mit Kaufgrund-Bezug
 *
 * RAUS, jeweils auf Nutzer-Vorgabe: Grenzen der Analyse, Erwartungs-Risiken und
 * Bild-Noten (D277) · Kennzahlen-Kacheln, Handlungsplan, Merkmale ohne
 * Kaufgrund, Versionsnummer, Quellen-Fussnote und Fusszeile (D283). Ein
 * Handlungsplan naegelt auf Massnahmen fest, die sich beim Gestalten aendern;
 * ein Score kommt erst wieder, wenn er am Sales Room haengt. Alles bleibt intern
 * im Analyse-Reiter sichtbar.
 *
 * Server-Komponente, kein Client-JS. Der Druck-Knopf lebt in der Kunden-Seite.
 */

const AMPEL: Record<Ampel, { zeichen: string; klasse: string; text: string }> = {
  gut: { zeichen: "●", klasse: "text-good", text: "abgedeckt" },
  teil: { zeichen: "◐", klasse: "text-warn", text: "schwach" },
  fehlt: { zeichen: "○", klasse: "text-bad", text: "fehlt" },
  unbekannt: { zeichen: "–", klasse: "text-muted", text: "nicht bewertbar" },
};

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

function AmpelZelle({ stufe }: { stufe: Ampel }) {
  const a = AMPEL[stufe];
  return (
    <span className={`whitespace-nowrap ${a.klasse}`} title={a.text}>
      {a.zeichen} <span className="text-[11px]">{a.text}</span>
    </span>
  );
}

/** Kapitel-Kopf: Nummer, Titel, ein Satz Einordnung. Hält den Rhythmus über alle Seiten. */
function Kapitel({ nr, titel, unter, children }: { nr: number; titel: string; unter?: string; children: React.ReactNode }) {
  return (
    <section className="dok-seite">
      <div className="dok-kapitelkopf">
        <span className="dok-nummer">{String(nr).padStart(2, "0")}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{titel}</h2>
          {unter && <p className="mt-0.5 text-xs leading-snug text-muted">{unter}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Eine Findings-Spalte (positiv oder negativ) — Label, Beleg-Zahl, ein O-Ton. */
function FindingListe({
  titel,
  eintraege,
  ton,
}: {
  titel: string;
  eintraege: InsightsReportPayload["findings"]["positiv"];
  ton: "gut" | "schlecht";
}) {
  const farbe = ton === "gut" ? "text-good" : "text-bad";
  const zeichen = ton === "gut" ? "+" : "−";
  return (
    <div>
      <h3 className={`text-sm font-semibold ${farbe}`}>{titel}</h3>
      {eintraege.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Keine belastbaren Muster in dieser Richtung.</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {eintraege.map((f, i) => (
            <li key={i} className="dok-finding">
              <div className="flex items-baseline gap-2">
                <span className={`flex-none font-semibold ${farbe}`}>{zeichen}</span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{f.label}</span>
                {f.nennungen !== null && (
                  <span className="flex-none text-[11px] tabular-nums text-muted" title="Bewertungen mit verifizierter Fundstelle">
                    {fmt(f.nennungen)}×
                  </span>
                )}
              </div>
              {f.zitat && <p className="mt-1 pl-4 text-[11px] italic leading-snug text-muted">„{f.zitat}“</p>}
              {/* D275: Befunde ohne eigene Fundstelle sind ein Marktsignal, kein
                  Urteil über dieses Produkt — das muss beim Kunden dranstehen. */}
              {f.nurFremd && (
                <p className="mt-1 pl-4 text-[11px] text-warn">Aus Bewertungen von Vergleichsprodukten, nicht von diesem Produkt.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InsightsDokument({ p }: { p: InsightsReportPayload }) {
  const db = p.datenbasis;
  const stand = new Date(p.kopf.stand);
  const hatFindings = p.findings.positiv.length > 0 || p.findings.negativ.length > 0;

  return (
    <article className="dok mx-auto max-w-3xl">
      {/* ── 1 · Titelblock ────────────────────────────────────────────────── */}
      <section className="dok-seite">
        {/* Markenkopf (D283, Nutzer): Bildmarke links, „temoa" daneben — nicht
            „temoa OS · Listing-Insights". Der Kunde sieht die Marke, nicht den
            Produktnamen unseres Werkzeugs. */}
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M12 2l2.2 6.1L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.9z" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">temoa</span>
        </div>

        <div className="mt-7 text-[11px] uppercase tracking-[0.18em] text-muted">Listing-Analyse · {p.kopf.marktplatz}</div>
        <h1 className="mt-1.5 text-3xl font-semibold leading-tight">{p.kopf.produktName}</h1>
        <p className="mt-1.5 text-xs text-muted">
          {p.kopf.asin && <span className="font-mono">{p.kopf.asin}</span>}
          {p.kopf.asin && " · "}
          Stand {stand.toLocaleDateString("de-DE")}
        </p>

        {p.kernThese && (
          <blockquote className="mt-6 border-l-[3px] border-l-[var(--primary)] bg-[var(--primary-soft)] px-5 py-4 text-[15px] leading-relaxed">
            {p.kernThese}
          </blockquote>
        )}

        {/* Zielgruppe & Positionierung (D283): der Rahmen, in dem alles Folgende
            gelesen wird. Ohne Quellen-Klammer — den Kunden interessiert die
            Aussage, nicht woher wir sie haben. */}
        {(p.zielgruppe || p.positionierung) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {p.zielgruppe && (
              <div className="rounded-xl border-l-[3px] border-l-[var(--primary)] border border-hair p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-strong">Zielgruppe</div>
                <p className="mt-1.5 text-sm leading-snug">{p.zielgruppe}</p>
              </div>
            )}
            {p.positionierung && (
              <div className="rounded-xl border-l-[3px] border-l-[var(--primary)] border border-hair p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-strong">Positionierung</div>
                <p className="mt-1.5 text-sm leading-snug">{p.positionierung}</p>
              </div>
            )}
          </div>
        )}

        {/* Datenbasis als Kacheln statt Fussnote (D283, Nutzer: „das ist
            vielleicht gar nicht so schlecht … stell es ein bisschen besser dar").
            Sie beantwortet die erste Frage jedes Kunden: Worauf beruht das? */}
        <div className="mt-6 border-t border-hair pt-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Worauf diese Analyse beruht</div>
          <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              db.reviewsAmazon !== null
                ? { wert: fmt(db.reviewsAmazon), label: "Bewertungen auf Amazon" }
                : { wert: fmt(db.reviewsAnalysiert), label: "Bewertungen erfasst" },
              db.ratingAvg !== null
                ? { wert: `${db.ratingAvg.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ★`, label: "Durchschnitt" }
                : null,
              db.reviewsAnalysiert > 0 ? { wert: fmt(db.reviewsAnalysiert), label: "im Detail ausgewertet" } : null,
              db.wettbewerberAsins > 0 ? { wert: String(db.wettbewerberAsins), label: "Vergleichsprodukte" } : null,
              db.bilderAnalysiert > 0 ? { wert: String(db.bilderAnalysiert), label: "Bilder ausgewertet" } : null,
              db.keywordsMitVolumen > 0 ? { wert: fmt(db.keywordsMitVolumen), label: "Suchbegriffe" } : null,
            ]
              .filter((x): x is { wert: string; label: string } => x !== null)
              .slice(0, 4)
              .map((k, i) => (
                <div key={i} className="rounded-xl border border-hair p-3">
                  <div className="text-xl font-semibold tabular-nums">{k.wert}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">{k.label}</div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ── 2 · Was Kunden sagen ──────────────────────────────────────────── */}
      {hatFindings && (
        <Kapitel
          nr={2}
          titel="Was Kunden sagen"
          unter="Wörtlich aus den Bewertungen — was gelobt und was kritisiert wird, mit der Zahl der Bewertungen, in denen wir es belegen konnten."
        >
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <FindingListe titel="Was gut ankommt" eintraege={p.findings.positiv} ton="gut" />
            <FindingListe titel="Was kritisiert wird" eintraege={p.findings.negativ} ton="schlecht" />
          </div>
        </Kapitel>
      )}

      {/* ── 3 · USPs ──────────────────────────────────────────────────────── */}
      {p.usps.length > 0 && (
        <Kapitel nr={3} titel="Was das Produkt auszeichnet" unter="Belegbare Alleinstellungsmerkmale aus Produktdaten und Listing — keine Werbeaussagen.">
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.usps.map((u, i) => (
              <li key={i} className="dok-finding flex items-baseline gap-2 rounded-xl border border-hair px-4 py-3 text-sm leading-snug">
                <span className="flex-none text-good">✓</span>
                <span className="min-w-0">{u}</span>
              </li>
            ))}
          </ul>
        </Kapitel>
      )}

      {/* ── 4 · Kaufgründe (das Herzstück) ────────────────────────────────── */}
      <Kapitel
        nr={4}
        titel="Warum Kunden dieses Produkt kaufen"
        unter="Nicht die Merkmale, sondern das Ergebnis, das Kunden erreichen wollen. Die Spalten rechts zeigen, ob Ihr Listing diesen Grund heute belegt."
      >
        <div className="mt-4 overflow-x-auto">
          <table className="dok-tabelle w-full text-sm">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Kaufgrund</th>
                <th className="w-20">Gewicht</th>
                <th className="w-24">im Text</th>
                <th className="w-24">im Bild</th>
              </tr>
            </thead>
            <tbody>
              {p.matrix.map((z) => (
                <tr key={z.id} className="align-top">
                  <td className="font-mono text-[11px] text-muted">{z.id}</td>
                  <td>
                    <div className="font-medium leading-snug">{z.resultat}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted">
                      {z.motiv} · belegt durch {z.quellen.join(", ")}
                    </div>
                    {/* D278: Warum das ein Kaufgrund ist — ein Satz statt nur einer
                        Klassen-Bezeichnung, sonst bleibt die Matrix behauptend. */}
                    {z.einordnung && <div className="mt-1 text-[11px] leading-snug text-muted">{z.einordnung}</div>}
                    {z.zitat && <div className="mt-1 text-[11px] italic leading-snug text-muted">„{z.zitat}“</div>}
                  </td>
                  <td className="text-[11px] tracking-[0.15em] text-primary-strong" title={`Relevanz ${z.relevanz}/5`}>
                    {"●".repeat(z.relevanz)}
                    <span className="opacity-25">{"●".repeat(5 - z.relevanz)}</span>
                  </td>
                  <td><AmpelZelle stufe={z.text} /></td>
                  <td><AmpelZelle stufe={z.bild} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {p.listing.dimensionen.length > 0 && (
          <>
            <h3 className="mt-7 text-sm font-semibold">Qualität der Listing-Texte heute</h3>
            <ul className="mt-2 space-y-1.5">
              {p.listing.dimensionen.map((d, i) => (
                <li key={i} className="dok-finding flex items-baseline gap-3 text-sm">
                  <span className="w-40 flex-none text-muted">{d.label}</span>
                  {d.score === null ? (
                    <span className="text-[11px] text-muted">nicht bewertbar — Inhalt liegt nicht vor</span>
                  ) : (
                    <>
                      <span className="h-2 w-32 flex-none overflow-hidden rounded-full bg-hair">
                        <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.min(100, d.score)}%` }} />
                      </span>
                      <span className="w-10 flex-none tabular-nums text-xs">{d.score}</span>
                    </>
                  )}
                  {d.befund && <span className="min-w-0 text-xs leading-snug text-muted">{d.befund}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Kapitel>

      {/* ── 5 · Blocker ───────────────────────────────────────────────────── */}
      {p.blocker.length > 0 && (
        <Kapitel
          nr={5}
          titel="Was den Kauf heute blockiert"
          unter="Kaufgründe, für die das Listing heute keinen Beweis liefert — in Text oder Bild."
        >
          {p.blocker.length > 0 && (
            <ul className="mt-4 space-y-3">
              {p.blocker.map((b, i) => (
                <li key={i} className="dok-finding rounded-xl border border-hair p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] text-primary-strong">{b.driverId}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{b.titel}</span>
                    <span className="flex-none rounded-full bg-hair px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      {b.art === "bild" ? "Bild" : "Text"}
                    </span>
                  </div>
                  {/* D278: Der Fließtext ist der eigentliche Inhalt — vorher stand
                      hier nur der Titelsatz, und das Dokument las sich entsprechend
                      dünn („vermisst eigentlich sämtliche Informationen"). */}
                  {b.begruendung && <p className="mt-2 text-sm leading-relaxed">{b.begruendung}</p>}
                  {b.resultat && <p className="mt-1.5 text-[11px] leading-snug text-muted">Betrifft den Kaufgrund: {b.resultat}</p>}
                </li>
              ))}
            </ul>
          )}

        </Kapitel>
      )}

    </article>
  );
}
