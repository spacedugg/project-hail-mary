import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeOffeneFreigaben, ladeMarkenCms, type OffeneFreigabe } from "@/lib/cms/laden";
import { approveContent } from "@/app/actions";
import { anKundenSchicken } from "@/app/cms-actions";
import { PILL_KLASSE, type FreigabeStufe } from "@/lib/cms/freigabestand";
import { asinKopf } from "@/lib/cms/asinKopf";
import type { ContentSlot } from "@/lib/amazon/attributes";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Freigabe-Board (D236/D237, Nutzer-Wunsch): der Content-Lebenszyklus als Spalten.
 *
 *   In Arbeit → Intern abgenommen → Beim Kunden → Vom Kunden freigegeben
 *
 * WICHTIG (D237, Nutzer-Entscheidung 28.07., korrigiert D236): Eine Karte ist
 * eine CHILD-ASIN als GANZES — NICHT jedes Content-Piece einzeln. Wir übertragen
 * und geben immer eine ASIN als Ganze frei; einzelne Pieces getrennt zu
 * betrachten ist ineffizient. Darum steht jede ASIN in GENAU EINER Spalte,
 * ausgerichtet am „schwächsten Glied" — dem am wenigsten weit fortgeschrittenen
 * Content-Piece. Solange ein Piece hinterherhinkt, ist die ganze ASIN noch nicht
 * durch. Die Spalte entscheidet Code (nicht das LLM) über `freigabe.stufe`.
 */

// Die Content-Pieces je ASIN (Nutzer-Vorgabe): Titel, Bullets, Beschreibung, Backend-Keywords, Item-Highlights.
const BOARD_SLOTS: ContentSlot[] = ["title", "bullets", "description", "backend_keywords", "item_highlights"];

const SPALTEN: { key: string; titel: string; unter: string; akzent: string }[] = [
  { key: "arbeit", titel: "In Arbeit", unter: "wartet auf interne Abnahme", akzent: "rgb(217 119 6" },
  { key: "intern", titel: "Intern abgenommen", unter: "beim Kunden absichern", akzent: "rgb(124 92 252" },
  { key: "kunde", titel: "Beim Kunden", unter: "Rückmeldung steht aus", akzent: "rgb(217 119 6" },
  { key: "frei", titel: "Vom Kunden freigegeben", unter: "abgesichert", akzent: "rgb(22 163 74" },
];

/** Stufe → Spaltenindex (0..3). „leer" zählt nicht mit. Änderungswunsch fällt auf Spalte 0 zurück. */
const RANG: Record<FreigabeStufe, number | null> = {
  leer: null,
  entwurf: 0,
  kunde_aenderung: 0,
  intern: 1,
  beim_kunden: 2,
  kunde_frei: 3,
};

export default async function Freigaben({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  if (!brand) notFound();

  const [offen, cms] = await Promise.all([ladeOffeneFreigaben(brandId), ladeMarkenCms(brandId)]);
  const offenMap = new Map<string, OffeneFreigabe>(offen.map((o) => [`${o.productId}:${o.slot}`, o]));

  // Je Child-ASIN: ihre Board-Pieces mit Inhalt + die schwächste Stufe → Spalte.
  const asins = (cms?.produkte ?? [])
    .filter((p) => p.variantRole !== "parent")
    .map((p) => {
      const pieces = p.slots.filter((sl) => BOARD_SLOTS.includes(sl.slot) && sl.freigabe.stufe !== "leer");
      const raenge = pieces.map((sl) => RANG[sl.freigabe.stufe]).filter((r): r is number => r !== null);
      const spalte = raenge.length ? Math.min(...raenge) : null;
      const kundeFrei = pieces.filter((sl) => sl.freigabe.stufe === "kunde_frei").length;
      const aenderung = pieces.some((sl) => sl.freigabe.stufe === "kunde_aenderung");
      return { p, pieces, spalte, kundeFrei, aenderung };
    })
    .filter((x) => x.spalte !== null);

  const spalten = SPALTEN.map((sp, i) => ({
    sp,
    items: asins.filter((a) => a.spalte === i).sort((a, b) => a.p.name.localeCompare(b.p.name)),
  }));

  return (
    <section className="mt-5 card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="sect-h">Freigabe-Board</h2>
        <span className="text-xs text-muted">{asins.length} ASIN{asins.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Jede Karte ist <b>eine ASIN als Ganzes</b>. Sie steht in der Spalte ihres <b>schwächsten Content-Pieces</b> —
        solange ein Piece hinterherhinkt, ist die ASIN noch nicht durch. Aufklappen zeigt die einzelnen Pieces mit
        Status und der nächsten Aktion.
      </p>

      {asins.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Noch kein Content angelegt — im Katalog ein Produkt öffnen und Content erzeugen.</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          {spalten.map(({ sp, items }) => (
            <div key={sp.key} className="rounded-2xl border border-hair p-2.5">
              <div className="mb-2 rounded-xl px-2.5 py-1.5" style={{ background: `${sp.akzent} / 0.08)`, borderLeft: `3px solid ${sp.akzent})` }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold">{sp.titel}</span>
                  <span className="text-[11px] tabular-nums text-muted">{items.length}</span>
                </div>
                <div className="text-[10px] text-muted">{sp.unter}</div>
              </div>

              {items.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-muted">—</p>
              ) : (
                <div className="space-y-2.5">
                  {items.map(({ p, pieces, kundeFrei, aenderung }) => {
                    const kopf = asinKopf(p.name, p.asin);
                    return (
                      <div key={p.id} className="rounded-xl border border-hair/70 p-2">
                        <Link href={`/produkte/${p.id}/content`} className="flex items-center gap-2 hover:opacity-80">
                          {p.bildUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={p.bildUrl} alt="" className="h-9 w-9 flex-none rounded-lg border border-hair bg-white object-contain" />
                          ) : (
                            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-hair bg-[var(--primary-soft)] text-[9px] text-primary-strong">ASIN</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold">{kopf.titel}</span>
                            {kopf.asinSub && <span className="block font-mono text-[10px] text-muted">{kopf.asinSub}</span>}
                          </span>
                        </Link>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                          <span className="tabular-nums">{kundeFrei}/{pieces.length} vom Kunden ✓</span>
                          {aenderung && <span className="pill pill-bad text-[9px]">Änderung erwünscht</span>}
                        </div>

                        <div className="mt-2 space-y-1.5">
                          {pieces.map((sl) => {
                            const draft = offenMap.get(`${p.id}:${sl.slot}`);
                            return (
                              <details key={sl.slot} className="rounded-lg border border-hair/70 bg-[var(--surface)] px-2 py-1.5">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-1.5">
                                  <span className="text-[11px] font-medium">{sl.label}</span>
                                  <span className={`${PILL_KLASSE[sl.freigabe.ton]} text-[9px]`}>{sl.freigabe.kurz}</span>
                                </summary>
                                <div className="mt-1.5 space-y-1.5 border-t border-hair/60 pt-1.5">
                                  {sl.freigabe.detail && <p className="text-[10px] text-muted">{sl.freigabe.detail}</p>}
                                  <div className="max-h-40 overflow-y-auto rounded-md bg-[var(--primary-soft)]/40 p-1.5 text-[10px] leading-snug">
                                    {(draft?.werte ?? sl.werte).length === 0 ? (
                                      <span className="text-muted">kein Wortlaut hinterlegt</span>
                                    ) : (
                                      (draft?.werte ?? sl.werte).map((w, i) => <p key={i} className={i > 0 ? "mt-1" : ""}>{w}</p>)
                                    )}
                                  </div>
                                  {sl.freigabe.stufe === "entwurf" && draft && (
                                    <form action={approveContent}>
                                      <input type="hidden" name="productId" value={p.id} />
                                      <input type="hidden" name="versionId" value={draft.versionId} />
                                      <SubmitButton className="btn-primary w-full text-[10px]">Intern abnehmen</SubmitButton>
                                    </form>
                                  )}
                                  {sl.freigabe.stufe === "entwurf" && !draft && (
                                    <Link href={`/produkte/${p.id}`} className="btn-ghost block text-center text-[10px]">Prüfung offen — in Werkstatt öffnen</Link>
                                  )}
                                  {sl.freigabe.stufe === "kunde_aenderung" && (
                                    <Link href={`/produkte/${p.id}/content`} className="btn-ghost block text-center text-[10px]">Änderung einarbeiten</Link>
                                  )}
                                  {sl.freigabe.stufe === "intern" && sl.versionId && (
                                    <form action={anKundenSchicken}>
                                      <input type="hidden" name="brandId" value={brandId} />
                                      <input type="hidden" name="versionId" value={sl.versionId} />
                                      <SubmitButton className="btn-dark w-full text-[10px]">Beim Kunden markieren</SubmitButton>
                                    </form>
                                  )}
                                  {(sl.freigabe.stufe === "beim_kunden" || sl.freigabe.stufe === "kunde_frei") && (
                                    <Link href={`/marke/${brandId}/publish/feedback`} className="text-[10px] text-primary-strong hover:underline">Feedback ansehen →</Link>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted">
        Der Kunde sieht intern abgenommene Stände automatisch auf seinem Portal — schicken musst du nichts. Portal-Link und
        Schalter &bdquo;Publish erst nach Kundenfreigabe&ldquo; unter{" "}
        <Link href={`/marke/${brandId}/publish/feedback`} className="underline">Kunden-Feedback</Link>.
      </p>
    </section>
  );
}
