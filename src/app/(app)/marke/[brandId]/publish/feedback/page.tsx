import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeMarkenCms, istPortal } from "@/lib/cms/laden";
import { slotDef, type ContentSlot } from "@/lib/amazon/attributes";
import { PILL_KLASSE } from "@/lib/cms/freigabestand";
import { asinKopf } from "@/lib/cms/asinKopf";
import {
  freigabeLinkErstellen,
  freigabeLinkWiderrufen,
  portalErstellen,
  portalNeuErzeugen,
  feedbackSchreiben,
  feedbackErledigen,
  kundenfreigabePflichtSetzen,
} from "@/app/cms-actions";
import { SubmitButton } from "@/components/submit-button";
import { CopyLink } from "@/components/copy-link";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";

export const dynamic = "force-dynamic";

const istAbgelaufen = (d: Date | null) => !!d && d.getTime() < Date.now();

// Content-Pieces, für die ein Feedback-Thread angeboten wird (Nutzer-Vorgabe).
const CORE: ContentSlot[] = ["title", "bullets", "description", "backend_keywords", "item_highlights"];

/**
 * Kunden-Feedback am Content-Piece (D236, Nutzer-Umbau).
 *
 * Ordnung: ASIN → Content-Piece → EINE Unterhaltung. Reine Verdikt-Klicks
 * (Kunde markiert dasselbe Piece zweimal als freigegeben) werden zu einer Zeile
 * zusammengefasst — redundante Log-Einträge tauchen nicht doppelt auf. Notizen
 * schreibt man direkt am Piece, nicht über ein generisches Auswahlfeld unten.
 *
 * Ansprechpartner beim Kunden gibt es hier bewusst NICHT mehr (Nutzer-Wunsch):
 * Als Agentur zählt nur, DASS freigegeben wurde, nicht wer geklickt hat. Ein
 * Portal = ein Link, ohne Personenbezug. (`client_contacts` bleibt in der DB
 * für spätere echte Kundenlogins — nur ungenutzt in dieser Ansicht.)
 */
export default async function CmsFeedback({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ fehler?: string; code?: string }>;
}) {
  const { brandId } = await params;
  const { fehler, code } = await searchParams;
  const cms = await ladeMarkenCms(brandId);
  if (!cms) notFound();

  const db = await getDb();
  const [shares, feedback, marke] = await Promise.all([
    db.query.contentShares.findMany({
      where: eq(schema.contentShares.brandId, brandId),
      orderBy: desc(schema.contentShares.createdAt),
    }),
    db.query.contentFeedback.findMany({
      where: eq(schema.contentFeedback.brandId, brandId),
      orderBy: desc(schema.contentFeedback.createdAt),
    }),
    db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) }),
  ]);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const basisUrl = `${proto}://${host}`;

  const pflichtAn = Boolean(marke?.publishNurMitKundenfreigabe);

  // Kunden-Portal = der eine dauerhafte Marken-Link. Befristete Links sind der Sonderfall.
  const portal = shares.find(istPortal) ?? null;
  const portalUrl = portal ? `${basisUrl}/freigabe/${portal.token}` : "";
  const befristete = shares.filter((s) => s.expiresAt !== null);

  const offenGesamt = feedback.filter((f) => f.status === "offen").length;

  // Feedback je Produkt vorsortieren.
  const fbProProdukt = new Map<string, typeof feedback>();
  for (const f of feedback) {
    const liste = fbProProdukt.get(f.productId);
    if (liste) liste.push(f);
    else fbProProdukt.set(f.productId, [f]);
  }

  const produkte = cms.produkte.filter((p) => p.variantRole !== "parent");

  return (
    <>
      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}

      {/* ── Schritt 1: Kunden-Portal — ohne das läuft kein Kunden-Feedback ──── */}
      <section className={`mt-5 card p-5 ${portal ? "border-2 border-primary/40" : "border-2 border-[var(--warn)]/50 bg-[rgb(217_119_6/0.05)]"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">
            {portal ? "Kunden-Portal" : "Schritt 1 · Kunden-Portal aktivieren"} · {cms.brand.name}
          </h2>
          {portal ? (
            <span className="pill pill-good">aktiv · dauerhaft</span>
          ) : (
            <span className="pill pill-warn">noch nicht aktiv</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          Ein <b>fester Link</b>, den du dem Kunden <b>einmal</b> gibst. Er sieht dort jederzeit den aktuellen Stand
          seiner Marke und gibt frei — ohne Login, ohne Zugriff auf Zahlen oder andere Kunden. Neuer, intern abgenommener
          Content erscheint automatisch. <b>Ohne aktives Portal kann kein Kunden-Feedback entstehen.</b>
        </p>

        {portal ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-xs text-primary-strong">
                {portalUrl}
              </code>
              <CopyLink url={portalUrl} />
              <a href={portalUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs">Vorschau</a>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-3">
              <form action={portalNeuErzeugen}>
                <input type="hidden" name="brandId" value={brandId} />
                <SubmitButton className="btn-ghost text-[11px]">Adresse neu erzeugen</SubmitButton>
              </form>
              <span className="text-[11px] text-muted">
                Entwertet den alten Link — nur nötig, wenn die Adresse in falsche Hände geraten ist.
              </span>
            </div>
          </>
        ) : (
          <form action={portalErstellen} className="mt-3">
            <input type="hidden" name="brandId" value={brandId} />
            <SubmitButton className="btn-primary text-sm">Portal aktivieren</SubmitButton>
          </form>
        )}
      </section>

      {/* ── Schritt 2: Ist die Kundenfreigabe Pflicht fürs Publish? ─────────── */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">Kundenfreigabe verpflichtend?</h2>
        <p className="mt-1 text-xs text-muted">
          Ist das gesetzt, <b>blockt das Publish-Gate</b>, solange ein Platz nicht vom Kunden freigegeben ist. Bei allen
          anderen Marken genügt das interne Vier-Augen-Prinzip.
        </p>
        <form action={kundenfreigabePflichtSetzen} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="brandId" value={brandId} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pflicht" defaultChecked={pflichtAn} />
            Publish erst nach Kundenfreigabe
          </label>
          <SubmitButton className="btn-dark text-xs">Speichern</SubmitButton>
          <span className="text-[11px] text-muted">
            Aktuell: {pflichtAn ? "Kundenfreigabe ist Pflicht" : "interne Abnahme genügt"}
          </span>
        </form>
      </section>

      {/* ── Feedback je ASIN → Content-Piece ────────────────────────────────── */}
      <section className="mt-4 card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Feedback am Content-Piece</h2>
          <span className="text-xs text-muted">{offenGesamt} offen · {feedback.length} gesamt</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Nach <b>ASIN</b> geordnet, darunter je Content-Piece <b>eine</b> Unterhaltung. Aufklappen, um zu lesen oder
          direkt am Piece eine Notiz / Antwort zu hinterlassen.
        </p>

        {produkte.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Keine ASINs in dieser Marke.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {produkte.map((p) => {
              const rows = fbProProdukt.get(p.id) ?? [];
              const offenHier = rows.filter((f) => f.status === "offen").length;
              const slotsMitFeedback = new Set(rows.map((r) => r.slot as ContentSlot));
              const pieceSlots: ContentSlot[] = [
                ...CORE.filter(
                  (c) => slotsMitFeedback.has(c) || p.slots.some((sl) => sl.slot === c && sl.freigabe.stufe !== "leer"),
                ),
                ...[...slotsMitFeedback].filter((s) => !CORE.includes(s)),
              ];

              return (
                <details key={p.id} open={offenHier > 0} className="rounded-xl border border-hair">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2.5 p-3">
                    {p.bildUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.bildUrl} alt="" className="h-10 w-10 flex-none rounded-lg border border-hair bg-white object-contain" />
                    ) : (
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-hair bg-[var(--primary-soft)] text-[10px] text-primary-strong">ASIN</span>
                    )}
                    <span className="min-w-0 flex-1">
                      {/* Kein doppeltes ASIN-Rendern (D237): asinKopf entscheidet, ob eine Unterzeile nötig ist. */}
                      {(() => {
                        const kopf = asinKopf(p.name, p.asin);
                        return (
                          <>
                            <span className="block truncate text-sm font-semibold">{kopf.titel}</span>
                            {kopf.asinSub && <span className="block font-mono text-[11px] text-muted">{kopf.asinSub}</span>}
                          </>
                        );
                      })()}
                    </span>
                    {offenHier > 0 ? (
                      <span className="pill pill-warn text-[11px]">{offenHier} offen</span>
                    ) : rows.length > 0 ? (
                      <span className="pill pill-good text-[11px]">erledigt</span>
                    ) : (
                      <span className="text-[11px] text-muted">kein Feedback</span>
                    )}
                  </summary>

                  <div className="space-y-3 border-t border-hair/60 p-3">
                    {pieceSlots.length === 0 && (
                      <p className="text-xs text-muted">Für diese ASIN ist noch kein Content-Piece angelegt.</p>
                    )}
                    {pieceSlots.map((slot) => {
                      const slotObj = p.slots.find((sl) => sl.slot === slot);
                      const label = slotObj?.label ?? slotDef(slot)?.label ?? slot;
                      const threadRows = rows
                        .filter((r) => r.slot === slot)
                        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                      const nachrichten = threadRows.filter((r) => r.nachricht && r.nachricht.trim());
                      // Reine Verdikt-Klicks ohne Text → nur der jüngste zählt (dedupe).
                      const reineVerdikte = threadRows.filter(
                        (r) => (r.art === "freigabe" || r.art === "aenderung") && !(r.nachricht && r.nachricht.trim()),
                      );
                      const letztesVerdikt = reineVerdikte[reineVerdikte.length - 1];

                      return (
                        <div key={slot} className="rounded-lg border border-hair/70 p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold">{label}</span>
                            {slotObj && <span className={`${PILL_KLASSE[slotObj.freigabe.ton]} text-[10px]`}>{slotObj.freigabe.kurz}</span>}
                          </div>

                          {/* Zusammengefasstes Kunden-Verdikt (dedupliziert) */}
                          {letztesVerdikt && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className={letztesVerdikt.art === "freigabe" ? "pill pill-good" : "pill pill-bad"}>
                                {letztesVerdikt.art === "freigabe" ? "Kunde: freigegeben" : "Kunde: Änderung gewünscht"}
                              </span>
                              <span className="text-muted">{letztesVerdikt.createdAt.toLocaleDateString("de-DE")}</span>
                              {letztesVerdikt.status === "offen" && (
                                <form action={feedbackErledigen} className="ml-auto">
                                  <input type="hidden" name="feedbackId" value={letztesVerdikt.id} />
                                  <input type="hidden" name="brandId" value={brandId} />
                                  <SubmitButton className="btn-ghost text-[10px]">erledigt</SubmitButton>
                                </form>
                              )}
                            </div>
                          )}

                          {/* Unterhaltung: alle Beiträge mit Text */}
                          {nachrichten.length > 0 && (
                            <ul className="mt-2 space-y-1.5">
                              {nachrichten.map((f) => (
                                <li key={f.id} className="border-l-2 border-hair pl-2">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                    <span className={f.autorTyp === "kunde" ? "pill pill-neutral" : "pill pill-warn"}>
                                      {f.autorTyp === "kunde" ? "Kunde" : "Team"}
                                    </span>
                                    <b className="text-[11px]">{f.autorName}</b>
                                    <span className="text-muted">{f.createdAt.toLocaleString("de-DE")}</span>
                                    {f.autorTyp === "kunde" && f.status === "offen" && (
                                      <form action={feedbackErledigen} className="ml-auto">
                                        <input type="hidden" name="feedbackId" value={f.id} />
                                        <input type="hidden" name="brandId" value={brandId} />
                                        <SubmitButton className="btn-ghost text-[10px]">erledigt</SubmitButton>
                                      </form>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs">{f.nachricht}</p>
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* Notiz / Antwort direkt am Piece — kein generisches Auswahlfeld */}
                          <form action={feedbackSchreiben} className="mt-2 flex items-center gap-1.5">
                            <input type="hidden" name="brandId" value={brandId} />
                            <input type="hidden" name="productId" value={p.id} />
                            <input type="hidden" name="slot" value={slot} />
                            <input
                              name="nachricht"
                              placeholder={nachrichten.length > 0 ? "Antworten …" : "Notiz an dieses Piece …"}
                              className="input-base flex-1 text-xs"
                            />
                            <SubmitButton className="btn-dark text-[10px]">Speichern</SubmitButton>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Sonderfall: befristete Links (eingeklappt, spart Platz) ─────────── */}
      <section className="mt-4 card p-4">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Befristete Links <span className="font-normal text-muted">· Sonderfall ({befristete.filter((s) => !s.revokedAt && !istAbgelaufen(s.expiresAt)).length} aktiv)</span>
          </summary>
          <p className="mt-2 text-xs text-muted">
            Für den Normalfall reicht das Portal oben. Einen befristeten Link brauchst du nur, wenn jemand
            <b> nur kommentieren</b> (nicht freigeben) oder der Zugang <b>automatisch ablaufen</b> soll.
          </p>
          <form action={freigabeLinkErstellen} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="brandId" value={brandId} />
            <input name="label" placeholder="Titel, z. B. Gegenlesen Rechtsabteilung" required className="input-base text-sm sm:col-span-2" />
            <input name="tage" type="number" min={1} max={180} defaultValue={30} className="input-base text-sm" title="Gültigkeit in Tagen" />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="darfFreigeben" defaultChecked /> darf freigeben (sonst nur kommentieren)
            </label>
            <SubmitButton className="btn-dark text-xs sm:col-span-2">Link erzeugen</SubmitButton>
          </form>

          <ul className="mt-3 space-y-2">
            {befristete.length === 0 && <li className="text-sm text-muted">Kein befristeter Link — brauchst du meist auch nicht.</li>}
            {befristete.map((s) => {
              const abgelaufen = istAbgelaufen(s.expiresAt);
              const tot = !!s.revokedAt || abgelaufen;
              return (
                <li key={s.id} className="border-b border-hair/60 pb-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{s.label}</b>
                    <span className={tot ? "pill pill-bad" : "pill pill-good"}>
                      {s.revokedAt ? "widerrufen" : abgelaufen ? "abgelaufen" : "aktiv"}
                    </span>
                    {!s.darfFreigeben && <span className="pill pill-neutral">nur Kommentare</span>}
                    <span className="text-muted">
                      {s.expiresAt ? `gültig bis ${s.expiresAt.toLocaleDateString("de-DE")}` : "ohne Ablauf"}
                    </span>
                    {!tot && (
                      <form action={freigabeLinkWiderrufen} className="ml-auto">
                        <input type="hidden" name="shareId" value={s.id} />
                        <input type="hidden" name="brandId" value={brandId} />
                        <SubmitButton className="btn-ghost text-[11px]">widerrufen</SubmitButton>
                      </form>
                    )}
                  </div>
                  {!tot && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <code className="flex-1 break-all rounded-lg bg-[var(--primary-soft)] px-2 py-1 text-[11px] text-primary-strong">
                        {basisUrl}/freigabe/{s.token}
                      </code>
                      <CopyLink url={`${basisUrl}/freigabe/${s.token}`} className="btn-ghost text-[11px]" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      </section>
    </>
  );
}
