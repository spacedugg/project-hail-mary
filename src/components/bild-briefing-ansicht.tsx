import { BILD_TYP_LABELS } from "@/lib/analysis/bildTypen";
import type { BildBriefingPayload, KonzeptStatus } from "@/lib/analysis/bildBriefing";

/**
 * Bilder-Briefing als Ansicht (D269) — strukturiert statt Textwand.
 *
 * Zweisprachig: Die Beschriftungen wechseln mit `payload.sprache`, die
 * sprachgebundenen Blöcke (Produktangaben, Kundenstimmen, heutiger Bildinhalt)
 * bleiben in der Listing-Sprache und sagen das auch — ein englischsprachiger
 * Designer gestaltet hier ein deutsches Listing.
 */

const T = {
  de: {
    auftrag: "Auftrag",
    konzepte: "Bild-Konzepte",
    konzeptLeer: "Aus dieser Analyse ist aktuell kein neues Bild nötig.",
    beweist: "beweist",
    warum: "Warum",
    typ: "Typ-Vorschlag",
    bezug: "Bezug",
    wahrheit: "Produkt-Wahrheit — muss stimmen",
    verboten: "Nicht erlaubt",
    bestand: "Heutiger Stand",
    kundensprache: "Kundensprache",
    uebernehmen: "übernehmen",
    vermeiden: "vermeiden",
    grenzen: "Grenzen dieser Grundlage",
    freiheit: "Bildtexte, Bildaufbau und Lichtsetzung entscheidet der Designer — dieses Briefing sagt nur, was ankommen soll.",
    spracheHinweis: (l: string) => `Produktangaben, Kundenstimmen und der heutige Bildinhalt stehen auf ${l} — sie beziehen sich auf das Listing, das gestaltet wird.`,
    status: { neu: "neues Bild", ersetzen: "ersetzt bestehendes Bild", nachschaerfen: "bestehendes Bild nachschärfen" } as Record<KonzeptStatus, string>,
    noten: "Design / Botschaft / Klarheit",
  },
  en: {
    auftrag: "Assignment",
    konzepte: "Image concepts",
    konzeptLeer: "This analysis currently calls for no new image.",
    beweist: "proves",
    warum: "Why",
    typ: "Suggested type",
    bezug: "Relates to",
    wahrheit: "Product truth — must be accurate",
    verboten: "Not allowed",
    bestand: "Current state",
    kundensprache: "Customer wording",
    uebernehmen: "use",
    vermeiden: "avoid",
    grenzen: "Limits of this input",
    freiheit: "Image copy, composition and lighting are the designer's call — this brief only states what must come across.",
    spracheHinweis: (l: string) => `Product facts, customer wording and the current image content stay in ${l} — they refer to the listing being designed.`,
    status: { neu: "new image", ersetzen: "replaces an existing image", nachschaerfen: "sharpen existing image" } as Record<KonzeptStatus, string>,
    noten: "Design / Message / Clarity",
  },
} as const;

const STATUS_PILL: Record<KonzeptStatus, string> = {
  neu: "pill pill-good",
  ersetzen: "pill pill-warn",
  nachschaerfen: "pill pill-neutral",
};

const note = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE"));

export function BildBriefingAnsicht({ p, hinweise }: { p: BildBriefingPayload; hinweise: string[] }) {
  const t = T[p.sprache];

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{t.auftrag}</h2>
          <span className="text-[11px] text-muted">
            {p.kopf.marke} · {p.kopf.produkt}
            {p.kopf.asin ? ` · ${p.kopf.asin}` : ""} · {p.kopf.marktplatz}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">{p.auftrag}</p>
        <p className="mt-3 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-xs text-primary-strong">{t.freiheit}</p>
        {p.sprache === "en" && (
          <p className="mt-2 text-xs text-muted">{t.spracheHinweis(p.kopf.listingSprache)}</p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">{t.konzepte}</h2>
        <div className="stagger mt-3 space-y-3">
          {p.konzepte.map((k) => (
            <div key={k.id} className="rounded-xl border border-hair p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-primary-strong">{k.id}</span>
                <span className={STATUS_PILL[k.status]}>{t.status[k.status]}</span>
                {k.bezugSlot !== null && (
                  <span className="text-[11px] text-muted">
                    {t.bezug}: {p.sprache === "de" ? "Bild" : "image"} {k.bezugSlot}
                  </span>
                )}
                {k.typ && <span className="pill pill-neutral">{t.typ}: {BILD_TYP_LABELS[k.typ]}</span>}
              </div>

              <p className="mt-2 text-sm leading-relaxed">{k.konzept}</p>

              <p className="mt-2 text-xs">
                <span className="font-semibold">{t.beweist}:</span>{" "}
                <span className="font-mono text-primary-strong">{k.driverIds.join(", ")}</span> — {k.resultat}
              </p>

              {k.findings.length > 0 && (
                <>
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.warum}</div>
                  <ul className="mt-1 space-y-1">
                    {k.findings.map((f, i) => (
                      <li key={i} className="text-xs text-muted">· {f}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
          {p.konzepte.length === 0 && <p className="text-sm text-muted">{t.konzeptLeer}</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.wahrheit}</h2>
          {p.sprache === "en" && <span className="text-[11px] text-muted">({p.kopf.listingSprache})</span>}
          <ul className="mt-2 space-y-1">
            {p.produktWahrheit.map((z, i) => (
              <li key={i} className="text-sm">· {z}</li>
            ))}
            {p.produktWahrheit.length === 0 && <li className="text-sm text-muted">—</li>}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.verboten}</h2>
          <ul className="mt-2 space-y-1">
            {p.verboten.map((z, i) => (
              <li key={i} className="text-sm text-bad">✕ {z}</li>
            ))}
          </ul>
        </section>
      </div>

      {p.bestand.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.bestand}</h2>
          {p.sprache === "en" && <span className="text-[11px] text-muted">({p.kopf.listingSprache})</span>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="pr-2">{t.typ}</th>
                  <th className="pr-2">{p.sprache === "de" ? "Inhalt" : "Content"}</th>
                  <th>{t.noten}</th>
                </tr>
              </thead>
              <tbody>
                {p.bestand.map((b) => (
                  <tr key={b.slot} className="border-b border-hair align-top">
                    <td className="py-2 pr-2 tabular-nums">{b.slot}</td>
                    <td className="pr-2 text-xs text-muted">{b.typ ? BILD_TYP_LABELS[b.typ] : "—"}</td>
                    <td className="pr-2">
                      {b.inhalt || "—"}
                      {b.hinweis && <div className="mt-0.5 text-[11px] text-warn">→ {b.hinweis}</div>}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-xs">
                      {note(b.design)} / {note(b.botschaft)} / {note(b.klarheit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(p.kundensprache.uebernehmen.length > 0 || p.kundensprache.vermeiden.length > 0) && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">
            {t.kundensprache} {p.sprache === "en" && <span className="text-[11px] font-normal text-muted">({p.kopf.listingSprache})</span>}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.kundensprache.uebernehmen.map((w, i) => (
              <span key={`u${i}`} className="rounded-full bg-[rgb(47_158_143/0.12)] px-2.5 py-1 text-xs text-good" title={t.uebernehmen}>
                {w}
              </span>
            ))}
            {p.kundensprache.vermeiden.map((w, i) => (
              <span key={`v${i}`} className="rounded-full bg-[rgb(220_38_38/0.1)] px-2.5 py-1 text-xs text-bad line-through" title={t.vermeiden}>
                {w}
              </span>
            ))}
          </div>
        </section>
      )}

      {(p.grenzen.length > 0 || hinweise.length > 0) && (
        <section className="card p-5">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{t.grenzen}</summary>
            <ul className="mt-2 space-y-1">
              {[...p.grenzen, ...hinweise].map((g, i) => (
                <li key={i} className="text-xs text-muted">ℹ {g}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
