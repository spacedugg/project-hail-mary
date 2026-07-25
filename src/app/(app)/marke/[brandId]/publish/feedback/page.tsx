import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeMarkenCms, istPortal } from "@/lib/cms/laden";
import { slotDef } from "@/lib/amazon/attributes";
import {
  kontaktAnlegen,
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

/**
 * Kunden-Feedback am Content-Piece.
 *
 * Kundenlogik bewusst in zwei Stufen:
 * - HEUTE: Ansprechpartner + zeitlich begrenzter Freigabe-Link. Der Kunde
 *   braucht kein Konto, um Content zu kommentieren oder freizugeben — genau
 *   diese Hürde verhindert sonst, dass Feedback überhaupt entsteht.
 * - SPÄTER (Stufe 3): Aus demselben Ansprechpartner wird ein echtes
 *   Kundenkonto (`client_contacts.password_hash` ist dafür schon da) — ohne
 *   Datenumzug, ohne zweites Datenmodell.
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
  const [kontakte, shares, feedback] = await Promise.all([
    db.query.clientContacts.findMany({ where: eq(schema.clientContacts.clientId, cms.brand.clientId) }),
    db.query.contentShares.findMany({
      where: eq(schema.contentShares.brandId, brandId),
      orderBy: desc(schema.contentShares.createdAt),
    }),
    db.query.contentFeedback.findMany({
      where: eq(schema.contentFeedback.brandId, brandId),
      orderBy: desc(schema.contentFeedback.createdAt),
    }),
  ]);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const basisUrl = `${proto}://${host}`;

  const marke = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  const pflichtAn = Boolean(marke?.publishNurMitKundenfreigabe);

  // Kunden-Portal = der eine dauerhafte Marken-Link. Befristete Links stehen
  // separat für Sonderfälle (nur-Kommentare, zeitlich begrenzte Vorlage).
  const portal = shares.find(istPortal) ?? null;
  const portalKontakt = portal?.contactId ? kontakte.find((k) => k.id === portal.contactId) ?? null : null;
  const portalUrl = portal ? `${basisUrl}/freigabe/${portal.token}` : "";
  const befristete = shares.filter((s) => s.expiresAt !== null);

  const produktName = (id: string) => cms.produkte.find((p) => p.id === id)?.name ?? "unbekanntes Produkt";
  const offen = feedback.filter((f) => f.status === "offen");

  return (
    <>
      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}

      {/* ── Kunden-Portal: der eine feste Link ─────────────────────────────── */}
      <section className="mt-5 card border-2 border-primary/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Kunden-Portal · {cms.brand.name}</h2>
          {portal && <span className="pill pill-good">aktiv · dauerhaft</span>}
        </div>
        <p className="mt-1 text-xs text-muted">
          Ein <b>fester Link</b>, den du dem Kunden <b>einmal</b> gibst. Er speichert ihn als Lesezeichen und sieht dort
          jederzeit den aktuellen Stand seiner Marke — <b>du musst nichts mehr schicken</b>. Neuer, intern abgenommener
          Content erscheint automatisch. Ohne Login, ohne Zugriff auf Zahlen, Berichte oder andere Kunden.
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

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>
                Angesprochen als:{" "}
                {portalKontakt ? <b className="text-foreground">{portalKontakt.name}</b> : "ohne festen Ansprechpartner"}
              </span>
              {/* Ansprechpartner nachträglich setzen/ändern */}
              {kontakte.length > 0 && (
                <form action={portalErstellen} className="flex items-center gap-1.5">
                  <input type="hidden" name="brandId" value={brandId} />
                  <select name="contactId" defaultValue={portal.contactId ?? ""} className="input-base text-[11px] py-1">
                    <option value="">ohne festen Ansprechpartner</option>
                    {kontakte.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                  <SubmitButton className="btn-ghost text-[11px]">übernehmen</SubmitButton>
                </form>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-hair pt-3">
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
          <form action={portalErstellen} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="brandId" value={brandId} />
            <label className="text-xs text-muted">
              Ansprechpartner (optional)
              <select name="contactId" defaultValue="" className="input-base mt-0.5 block text-sm">
                <option value="">ohne festen Ansprechpartner</option>
                {kontakte.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </label>
            <SubmitButton className="btn-primary text-xs">Portal aktivieren</SubmitButton>
          </form>
        )}
      </section>


      {/* Marken-Schalter: Publish erst nach Kundenfreigabe */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">Kundenfreigabe verpflichtend?</h2>
        <p className="mt-1 text-xs text-muted">
          Bei Kunden, die mitreden wollen: Ist das gesetzt, <b>blockt das Publish-Gate</b>, solange ein Platz nicht vom
          Kunden freigegeben ist. Bei allen anderen Marken bleibt es beim internen Vier-Augen-Prinzip.
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── Ansprechpartner ────────────────────────────────────────────── */}
        <section className="card p-4">
          <h2 className="sect-h">Ansprechpartner beim Kunden</h2>
          <ul className="mt-2 space-y-1">
            {kontakte.length === 0 && <li className="text-sm text-muted">Noch keiner hinterlegt.</li>}
            {kontakte.map((k) => (
              <li key={k.id} className="text-sm">
                <b>{k.name}</b> <span className="text-muted">· {k.email}</span>
                {k.rolle && <span className="ml-1 pill pill-neutral">{k.rolle}</span>}
              </li>
            ))}
          </ul>
          <form action={kontaktAnlegen} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="brandId" value={brandId} />
            <input type="hidden" name="clientId" value={cms.brand.clientId} />
            <input name="name" placeholder="Name" required className="input-base text-sm" />
            <input name="email" type="email" placeholder="E-Mail" required className="input-base text-sm" />
            <input name="rolle" placeholder="Rolle (optional)" className="input-base text-sm" />
            <SubmitButton className="btn-dark text-xs">Anlegen</SubmitButton>
          </form>
        </section>

        {/* ── Befristete Links (Sonderfälle) ─────────────────────────────── */}
        <section className="card p-4">
          <h2 className="sect-h">Befristete Links <span className="font-normal text-muted">· Sonderfall</span></h2>
          <p className="mt-1 text-xs text-muted">
            Für den Normalfall reicht das Portal oben. Einen befristeten Link brauchst du nur, wenn jemand
            <b> nur kommentieren</b> (nicht freigeben) oder der Zugang <b>automatisch ablaufen</b> soll.
          </p>
          <form action={freigabeLinkErstellen} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="brandId" value={brandId} />
            <input name="label" placeholder="Titel, z. B. Gegenlesen Rechtsabteilung" required className="input-base text-sm sm:col-span-2" />
            <select name="contactId" defaultValue="" className="input-base text-sm">
              <option value="">ohne festen Ansprechpartner</option>
              {kontakte.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
            <input name="tage" type="number" min={1} max={180} defaultValue={30} className="input-base text-sm" title="Gültigkeit in Tagen" />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="darfFreigeben" defaultChecked /> darf freigeben (sonst nur kommentieren)
            </label>
            <SubmitButton className="btn-dark text-xs">Link erzeugen</SubmitButton>
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
        </section>
      </div>

      {/* ── Feedback-Eingang ─────────────────────────────────────────────── */}
      <section className="mt-4 card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Feedback am Content-Piece</h2>
          <span className="text-xs text-muted">{offen.length} offen · {feedback.length} gesamt</span>
        </div>
        {feedback.length === 0 && <p className="mt-2 text-sm text-muted">Noch kein Feedback — weder vom Team noch vom Kunden.</p>}
        {/* Nach Produkt gruppiert (Nutzer-Wunsch 22.07.): Auf Markenebene ist die
            erste Frage „bei welchem Produkt hakt es", nicht die Chronologie. */}
        {cms.produkte
          .map((p) => ({ p, eigene: feedback.filter((f) => f.productId === p.id) }))
          .filter((g) => g.eigene.length > 0)
          .map(({ p, eigene }) => (
            <div key={p.id} className="mt-4">
              <div className="flex flex-wrap items-baseline gap-2 border-b border-hair pb-1">
                <Link href={`/produkte/${p.id}/content`} className="text-sm font-semibold hover:underline">{p.name}</Link>
                {p.asin && <span className="font-mono text-[11px] text-muted">{p.asin}</span>}
                <span className="text-[11px] text-muted">
                  {eigene.filter((f) => f.status === "offen").length} offen von {eigene.length}
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {eigene.map((f) => (
                  <li key={f.id} className="border-b border-hair/60 pb-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={f.autorTyp === "kunde" ? "pill pill-neutral" : "pill pill-warn"}>
                  {f.autorTyp === "kunde" ? "Kunde" : "Team"}
                </span>
                <b>{f.autorName}</b>
                <span className="text-muted">
                  {produktName(f.productId)} · {slotDef(f.slot)?.label ?? f.slot}
                  {f.ankerIndex !== null && f.ankerIndex !== undefined ? ` #${f.ankerIndex + 1}` : ""}
                </span>
                <span className={f.art === "freigabe" ? "pill pill-good" : f.art === "aenderung" ? "pill pill-bad" : "pill pill-neutral"}>
                  {f.art === "freigabe" ? "freigegeben" : f.art === "aenderung" ? "Änderung gewünscht" : "Kommentar"}
                </span>
                <span className="text-muted">{f.createdAt.toLocaleString("de-DE")}</span>
                {f.status === "offen" ? (
                  <form action={feedbackErledigen} className="ml-auto">
                    <input type="hidden" name="feedbackId" value={f.id} />
                    <input type="hidden" name="brandId" value={brandId} />
                    <SubmitButton className="btn-ghost text-[11px]">erledigt</SubmitButton>
                  </form>
                ) : (
                  <span className="ml-auto pill pill-good">erledigt{f.erledigtVon ? ` · ${f.erledigtVon}` : ""}</span>
                )}
              </div>
              {f.nachricht && <p className="mt-1 text-sm">{f.nachricht}</p>}
                  {/* Team antwortet direkt auf einen Kundenkommentar — dieselbe
                      product+slot-Ablage, der Kunde sieht es auf seiner Seite. */}
                  {f.autorTyp === "kunde" && (
                    <form action={feedbackSchreiben} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="brandId" value={brandId} />
                      <input type="hidden" name="productId" value={f.productId} />
                      <input type="hidden" name="slot" value={f.slot} />
                      <input name="nachricht" placeholder="Antwort an den Kunden …" className="input-base flex-1 text-xs" />
                      <SubmitButton className="btn-dark text-[11px]">Antworten</SubmitButton>
                    </form>
                  )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <form action={feedbackSchreiben} className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input type="hidden" name="brandId" value={brandId} />
          <select name="productId" className="input-base text-sm" required defaultValue="">
            <option value="" disabled>Produkt wählen …</option>
            {cms.produkte.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="slot" className="input-base text-sm" defaultValue="title">
            {cms.produkte[0]?.slots.map((s) => (
              <option key={s.slot} value={s.slot}>{s.label}</option>
            ))}
          </select>
          <SubmitButton className="btn-dark text-xs">Notiz speichern</SubmitButton>
          <textarea name="nachricht" rows={2} className="input-base text-sm sm:col-span-3" placeholder="Interne Notiz oder Antwort auf Kundenfeedback …" />
        </form>
      </section>
    </>
  );
}
