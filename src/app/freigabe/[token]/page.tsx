import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeShare, ladeMarkenCms } from "@/lib/cms/laden";
import { kundenFeedbackAsin } from "@/app/cms-actions";
import { asinKopf } from "@/lib/cms/asinKopf";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Kunden-Seite (öffentlich, nur mit gültigem Freigabe-Token).
 *
 * Bewusst minimal: Der Kunde sieht ausschließlich den für ihn freigegebenen
 * Content dieser einen Marke — keine Zahlen, keine Berichte, keine anderen Kunden.
 *
 * WHOLE-ASIN (D237, Nutzer-Wunsch): Feedback läuft je ASIN als GANZES — alle
 * Content-Pieces einer ASIN untereinander, darunter EIN Feld zum Freigeben oder
 * Änderung-Wünschen. Kein Feedback je Einzel-Piece (ineffizient), kein „Nur
 * kommentieren" (darauf folgt kein Prozessschritt). Zusätzlich sieht der Kunde
 * den Status quo: was ist freigegeben, was wartet, was ist noch in Bearbeitung.
 */

type PortalStatus = "bearbeitung" | "wartet" | "aenderung" | "frei";
const STATUS_PILL: Record<PortalStatus, { pill: string; text: string }> = {
  frei: { pill: "pill pill-good", text: "von Ihnen freigegeben" },
  aenderung: { pill: "pill pill-bad", text: "Änderung angefragt" },
  wartet: { pill: "pill pill-warn", text: "wartet auf Ihre Rückmeldung" },
  bearbeitung: { pill: "pill pill-neutral", text: "noch in Bearbeitung" },
};

export default async function FreigabeSeite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { token } = await params;
  const { fehler } = await searchParams;
  const res = await ladeShare(token);

  if (!res.ok) {
    return (
      <main className="mx-auto max-w-lg p-10">
        <div className="card p-6">
          <h1 className="page-title">Kein Zugriff</h1>
          <p className="page-sub">{res.grund}</p>
          <p className="mt-4 text-xs text-muted">Bitte fordern Sie bei Ihrer Ansprechpartnerin oder Ihrem Ansprechpartner einen neuen Link an.</p>
        </div>
      </main>
    );
  }

  const { share, brand, kontakt } = res.ctx;
  const cms = await ladeMarkenCms(brand.id);
  const erlaubt = share.productIds;
  const produkte = (cms?.produkte ?? [])
    .filter((p) => !p.variantParentContainer) // Container-Parents haben keinen eigenen Content
    .filter((p) => !erlaubt || erlaubt.includes(p.id));

  const db = await getDb();
  const feedback = await db.query.contentFeedback.findMany({
    where: eq(schema.contentFeedback.brandId, brand.id),
    orderBy: schema.contentFeedback.createdAt,
  });

  type Slot = (typeof produkte)[number]["slots"][number];
  const sichtbar = (s: Slot) => s.status === "freigegeben" && s.werte.length > 0 && s.kind !== "aplus";
  const statusVon = (p: (typeof produkte)[number]): PortalStatus => {
    const rel = p.slots.filter(sichtbar);
    if (rel.length === 0) return "bearbeitung";
    if (rel.some((s) => s.freigabe.stufe === "kunde_aenderung")) return "aenderung";
    if (rel.every((s) => s.freigabe.stufe === "kunde_frei")) return "frei";
    return "wartet";
  };

  const mitStatus = produkte.map((p) => ({ p, status: statusVon(p), pieces: p.slots.filter(sichtbar) }));
  const zahl = (s: PortalStatus) => mitStatus.filter((x) => x.status === s).length;

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <header>
        <div className="text-[11px] uppercase tracking-wide text-muted">Content-Freigabe · {brand.name}</div>
        <h1 className="page-title mt-1">{share.label}</h1>
        <p className="page-sub">
          {kontakt ? `Guten Tag ${kontakt.name}, hier` : "Hier"} sehen Sie den für Ihre Produkte erarbeiteten Content —
          je Artikel gebündelt. Geben Sie einen Artikel als Ganzes frei{share.darfFreigeben ? "" : " (dieser Link erlaubt nur Rückmeldungen)"} oder wünschen Sie eine Änderung.
        </p>
        {share.expiresAt && (
          <p className="mt-2 text-xs text-muted">Dieser Link ist gültig bis {share.expiresAt.toLocaleDateString("de-DE")}.</p>
        )}
      </header>

      {/* Status quo auf einen Blick */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="pill pill-warn">{zahl("wartet") + zahl("aenderung")} wartet auf Sie</span>
        <span className="pill pill-good">{zahl("frei")} freigegeben</span>
        {zahl("bearbeitung") > 0 && <span className="pill pill-neutral">{zahl("bearbeitung")} noch in Bearbeitung</span>}
      </div>

      {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.1)] px-3 py-2 text-sm text-bad">{fehler}</p>}
      {mitStatus.length === 0 && <p className="mt-6 card p-4 text-sm text-muted">Für diese Freigabe liegt noch kein Content bereit.</p>}

      <div className="mt-5 space-y-4">
        {mitStatus.map(({ p, status, pieces }) => {
          const kopf = asinKopf(p.name, p.asin);
          const offen = status === "wartet" || status === "aenderung";
          // Nachrichten (ein Kunden-Kommentar + Team-Antworten) — Verdikte ohne Text ausgeblendet, keine Dopplung.
          const nachrichten = feedback.filter((f) => f.productId === p.id && f.nachricht && f.nachricht.trim());
          return (
            <details key={p.id} open={offen} className="card overflow-hidden p-0">
              <summary className="flex cursor-pointer items-center gap-3 p-4">
                {p.bildUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.bildUrl} alt="" className="h-12 w-12 flex-none rounded-lg border border-hair bg-white object-contain" />
                ) : (
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg border border-hair bg-[var(--primary-soft)] text-[10px] text-primary-strong">Artikel</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{kopf.titel}</span>
                  {kopf.asinSub && <span className="block font-mono text-[11px] text-muted">{kopf.asinSub}</span>}
                </span>
                <span className={STATUS_PILL[status].pill}>{STATUS_PILL[status].text}</span>
              </summary>

              <div className="border-t border-hair px-4 pb-4">
                {status === "bearbeitung" ? (
                  <p className="mt-3 text-sm text-muted">Dieser Artikel ist noch in Bearbeitung — Sie bekommen ihn hier zur Freigabe, sobald er fertig ist.</p>
                ) : (
                  <>
                    {/* Alle Content-Pieces der ASIN untereinander */}
                    <div className="mt-3 space-y-3">
                      {pieces.map((s) => (
                        <div key={s.slot} className="rounded-xl border border-hair p-3">
                          <h3 className="text-sm font-semibold">{s.label}</h3>
                          {s.kind === "image" ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={s.werte[0]} alt={s.label} className="mt-2 max-h-64 rounded-lg border border-hair" />
                          ) : s.werte.length > 1 ? (
                            <ul className="mt-2 space-y-1.5">
                              {s.werte.map((w, i) => (
                                <li key={i} className="text-sm leading-relaxed"><span className="mr-1.5 text-muted">{i + 1}.</span>{w}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.werte[0]}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Unterhaltung zur ASIN */}
                    {nachrichten.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-hair pt-3">
                        {nachrichten.map((f) => {
                          const vomKunden = f.autorTyp === "kunde";
                          return (
                            <div key={f.id} className={`flex ${vomKunden ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${vomKunden ? "bg-primary text-white" : "border border-hair bg-[var(--sunk,rgb(0_0_0/0.04))]"}`}>
                                <div className={`mb-0.5 text-[10px] ${vomKunden ? "text-white/70" : "text-muted"}`}>
                                  {vomKunden ? "Sie" : `${f.autorName} · Team`} · {f.createdAt.toLocaleDateString("de-DE")}
                                  {f.art === "aenderung" && " · Änderungswunsch"}
                                </div>
                                {f.nachricht}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* EIN Feedback-Feld für die ganze ASIN */}
                    <form action={kundenFeedbackAsin} className="mt-3 grid gap-2 border-t border-hair pt-3">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="productId" value={p.id} />
                      {!kontakt && <input name="name" placeholder="Ihr Name" className="input-base text-sm" />}
                      <textarea
                        name="nachricht"
                        rows={2}
                        className="input-base text-sm"
                        placeholder={status === "frei" ? "Etwas anmerken oder eine Änderung anstoßen …" : "Optionale Anmerkung zum ganzen Artikel …"}
                      />
                      <div className="flex flex-wrap gap-2">
                        {share.darfFreigeben && (
                          <SubmitButton name="art" value="freigabe" className="btn-primary text-sm">✓ Artikel freigeben</SubmitButton>
                        )}
                        <SubmitButton name="art" value="aenderung" className="btn-dark text-sm">Änderung wünschen</SubmitButton>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[11px] text-muted">temoa OS · Content-Freigabe</p>
    </main>
  );
}
