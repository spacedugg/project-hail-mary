import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeOffeneFreigaben, ladeMarkenCms, type OffeneFreigabe } from "@/lib/cms/laden";
import { approveContent } from "@/app/actions";
import { anKundenSchicken } from "@/app/cms-actions";
import { PILL_KLASSE, type FreigabeStufe } from "@/lib/cms/freigabestand";
import type { ContentSlot } from "@/lib/amazon/attributes";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Freigabe-Board (D236, Nutzer-Wunsch): der Content-Lebenszyklus als Spalten.
 *
 * Vorher eine flache Liste „was wartet auf Abnahme" + zwei weitere Abschnitte
 * darunter — man sah nie auf einen Blick, in welchem Stadium was steckt.
 *
 *   In Arbeit → Intern abgenommen → Beim Kunden → Vom Kunden freigegeben
 *
 * WICHTIG (Nutzer-Entscheidung): Karten sind CONTENT-PIECES, nicht ASINs. Eine
 * ASIN mit gemischten Ständen ließe sich sonst keiner Spalte eindeutig zuordnen.
 * Jedes Piece steht einzeln in der Spalte seines eigenen Status; die Karten sind
 * je Spalte nach ASIN gruppiert (Thumbnail + ASIN), damit die Zuordnung klar
 * bleibt. Welche Spalte ein Piece bekommt, entscheidet Code (nicht das LLM) —
 * anhand der einen Freigabe-Kette `freigabe.stufe`.
 */

// Die fünf Content-Pieces je ASIN, die im Board sichtbar sind (Nutzer-Vorgabe):
// Titel, Bullet Points, Beschreibung, Backend-Keywords, Item-Highlights.
const BOARD_SLOTS: ContentSlot[] = ["title", "bullets", "description", "backend_keywords", "item_highlights"];

const SPALTEN: { key: string; titel: string; unter: string; stufen: FreigabeStufe[]; akzent: string }[] = [
  { key: "arbeit", titel: "In Arbeit", unter: "wartet auf interne Abnahme", stufen: ["entwurf", "kunde_aenderung"], akzent: "rgb(217 119 6" },
  { key: "intern", titel: "Intern abgenommen", unter: "beim Kunden absichern", stufen: ["intern"], akzent: "rgb(124 92 252" },
  { key: "kunde", titel: "Beim Kunden", unter: "Rückmeldung steht aus", stufen: ["beim_kunden"], akzent: "rgb(217 119 6" },
  { key: "frei", titel: "Vom Kunden freigegeben", unter: "abgesichert", stufen: ["kunde_frei"], akzent: "rgb(22 163 74" },
];

export default async function Freigaben({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  if (!brand) notFound();

  const [offen, cms] = await Promise.all([ladeOffeneFreigaben(brandId), ladeMarkenCms(brandId)]);
  // Abnehmbare Entwürfe (neuester Stand je Sektion, Prüfung bestanden) — daraus
  // holen wir für die „In Arbeit"-Karten die Version-ID und den Wortlaut.
  const offenMap = new Map<string, OffeneFreigabe>(offen.map((o) => [`${o.productId}:${o.slot}`, o]));

  // Alle Content-Pieces sammeln — nur Child/Standalone (keine Parent-Container),
  // nur die fünf Board-Slots, und nur, wenn überhaupt Inhalt da ist (kein „leer").
  const pieces = (cms?.produkte ?? [])
    .filter((p) => p.variantRole !== "parent")
    .flatMap((p) =>
      p.slots
        .filter((sl) => BOARD_SLOTS.includes(sl.slot) && sl.freigabe.stufe !== "leer")
        .map((sl) => ({ p, sl })),
    );

  const spalten = SPALTEN.map((sp) => {
    const drin = pieces.filter(({ sl }) => sp.stufen.includes(sl.freigabe.stufe));
    // Je Spalte nach ASIN/Produkt gruppieren.
    const gruppen = Object.values(
      drin.reduce(
        (acc, x) => {
          (acc[x.p.id] ??= { p: x.p, items: [] as typeof drin }).items.push(x);
          return acc;
        },
        {} as Record<string, { p: (typeof drin)[number]["p"]; items: typeof drin }>,
      ),
    ).sort((a, b) => a.p.name.localeCompare(b.p.name));
    return { sp, anzahl: drin.length, gruppen };
  });

  const gesamt = pieces.length;

  return (
    <>
      <section className="mt-5 card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Freigabe-Board</h2>
          <span className="text-xs text-muted">{gesamt} Content-Piece{gesamt === 1 ? "" : "s"} über alle ASINs</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Jede Karte ist <b>ein Content-Piece</b> (Titel, Bullet Points, Beschreibung, Backend-Keywords oder
          Item-Highlights) einer ASIN und steht in der Spalte seines Status. Karten je Spalte nach ASIN gruppiert.
          Aufklappen zeigt den Wortlaut und die nächste Aktion. Steht ein Piece links, ist die Arbeit noch nicht durch —
          egal, wie weit die anderen Pieces derselben ASIN schon sind.
        </p>

        {gesamt === 0 ? (
          <p className="mt-4 text-sm text-muted">Noch kein Content angelegt — im Katalog ein Produkt öffnen und Content erzeugen.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            {spalten.map(({ sp, anzahl, gruppen }) => (
              <div key={sp.key} className="rounded-2xl border border-hair bg-[var(--surface-2,transparent)] p-2.5">
                <div
                  className="mb-2 rounded-xl px-2.5 py-1.5"
                  style={{ background: `${sp.akzent} / 0.08)`, borderLeft: `3px solid ${sp.akzent})` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold">{sp.titel}</span>
                    <span className="text-[11px] tabular-nums text-muted">{anzahl}</span>
                  </div>
                  <div className="text-[10px] text-muted">{sp.unter}</div>
                </div>

                {gruppen.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-muted">—</p>
                ) : (
                  <div className="space-y-2.5">
                    {gruppen.map(({ p, items }) => (
                      <div key={p.id} className="rounded-xl border border-hair/70 p-2">
                        {/* ASIN-Kopf: Thumbnail + ASIN, damit die Zuordnung klar ist */}
                        <Link href={`/produkte/${p.id}/content`} className="flex items-center gap-2 hover:opacity-80">
                          {p.bildUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.bildUrl} alt="" className="h-8 w-8 flex-none rounded-lg border border-hair bg-white object-contain" />
                          ) : (
                            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-hair bg-[var(--primary-soft)] text-[10px] text-primary-strong">ASIN</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold">{p.name}</span>
                            {p.asin && <span className="block font-mono text-[10px] text-muted">{p.asin}</span>}
                          </span>
                        </Link>

                        <div className="mt-2 space-y-1.5">
                          {items.map(({ sl }) => {
                            const draft = offenMap.get(`${p.id}:${sl.slot}`);
                            return (
                              <details key={sl.slot} className="group rounded-lg border border-hair/70 bg-[var(--surface)] px-2 py-1.5">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-1.5">
                                  <span className="text-[11px] font-medium">{sl.label}</span>
                                  <span className="flex items-center gap-1">
                                    {sl.entwurfOffen && sl.freigabe.stufe !== "entwurf" && (
                                      <span className="pill pill-warn text-[9px]" title="Ein neuerer Entwurf wartet noch auf Abnahme">neuer Entwurf</span>
                                    )}
                                    <span className={`${PILL_KLASSE[sl.freigabe.ton]} text-[9px]`}>{sl.freigabe.kurz}</span>
                                  </span>
                                </summary>

                                <div className="mt-1.5 space-y-1.5 border-t border-hair/60 pt-1.5">
                                  {sl.freigabe.detail && <p className="text-[10px] text-muted">{sl.freigabe.detail}</p>}

                                  {/* Wortlaut zum Prüfen (Entwurf: aus dem abnehmbaren Draft, sonst der Soll-Wert) */}
                                  <div className="max-h-40 overflow-y-auto rounded-md bg-[var(--primary-soft)]/40 p-1.5 text-[10px] leading-snug">
                                    {(draft?.werte ?? sl.werte).length === 0 ? (
                                      <span className="text-muted">kein Wortlaut hinterlegt</span>
                                    ) : (
                                      (draft?.werte ?? sl.werte).map((w, i) => (
                                        <p key={i} className={i > 0 ? "mt-1" : ""}>{w}</p>
                                      ))
                                    )}
                                  </div>

                                  {/* Nächste Aktion je Stufe */}
                                  {sl.freigabe.stufe === "entwurf" && draft && (
                                    <form action={approveContent}>
                                      <input type="hidden" name="productId" value={p.id} />
                                      <input type="hidden" name="versionId" value={draft.versionId} />
                                      <SubmitButton className="btn-primary w-full text-[10px]">Intern abnehmen</SubmitButton>
                                    </form>
                                  )}
                                  {sl.freigabe.stufe === "entwurf" && !draft && (
                                    <Link href={`/produkte/${p.id}`} className="btn-ghost block text-center text-[10px]">
                                      Prüfung offen — in Werkstatt öffnen
                                    </Link>
                                  )}
                                  {sl.freigabe.stufe === "kunde_aenderung" && (
                                    <Link href={`/produkte/${p.id}/content`} className="btn-ghost block text-center text-[10px]">
                                      Änderung einarbeiten
                                    </Link>
                                  )}
                                  {sl.freigabe.stufe === "intern" && sl.versionId && (
                                    <form action={anKundenSchicken}>
                                      <input type="hidden" name="brandId" value={brandId} />
                                      <input type="hidden" name="versionId" value={sl.versionId} />
                                      <SubmitButton className="btn-dark w-full text-[10px]">Beim Kunden markieren</SubmitButton>
                                    </form>
                                  )}
                                  {(sl.freigabe.stufe === "beim_kunden" || sl.freigabe.stufe === "kunde_frei") && (
                                    <Link href={`/marke/${brandId}/publish/feedback`} className="text-[10px] text-primary-strong hover:underline">
                                      Feedback ansehen →
                                    </Link>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted">
          Der Kunde sieht intern abgenommene Stände automatisch auf seinem Portal — schicken musst du nichts. Den
          Portal-Link und den Schalter &bdquo;Publish erst nach Kundenfreigabe&ldquo; findest du unter{" "}
          <Link href={`/marke/${brandId}/publish/feedback`} className="underline">Kunden-Feedback</Link>.
        </p>
      </section>
    </>
  );
}
