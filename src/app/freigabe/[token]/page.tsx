import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeShare, ladeMarkenCms } from "@/lib/cms/laden";
import { kundenFeedback } from "@/app/cms-actions";
import { SubmitButton } from "@/components/submit-button";
import { FreigabeStepper } from "@/components/freigabe-stepper";

export const dynamic = "force-dynamic";

/**
 * Kunden-Seite (öffentlich, nur mit gültigem Freigabe-Token).
 *
 * Bewusst minimal: Der Kunde sieht ausschließlich den für ihn freigegebenen
 * Content dieser einen Marke — keine Zahlen, keine Berichte, keine anderen
 * Kunden. Kein Login: Die Hürde eines Kontos ist genau der Grund, warum
 * Content-Feedback sonst im E-Mail-Verlauf versandet.
 *
 * Jede Rückmeldung wird an die konkrete Version geheftet — so bleibt später
 * nachvollziehbar, auf welchen Stand sich eine Aussage bezog.
 */
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
  const produkte = (cms?.produkte ?? []).filter((p) => !erlaubt || erlaubt.includes(p.id));

  const db = await getDb();
  const feedback = await db.query.contentFeedback.findMany({
    where: eq(schema.contentFeedback.brandId, brand.id),
    orderBy: schema.contentFeedback.createdAt,
  });

  // Wie viele freigegebene Text-/Bild-Bausteine warten noch auf die Antwort des
  // Kunden (weder freigegeben noch Änderung angefragt)?
  const sichtbar = (sl: (typeof produkte)[number]["slots"][number]) =>
    sl.status === "freigegeben" && sl.werte.length > 0 && sl.kind !== "aplus";
  const kundenStatus = (produktId: string, slot: string): "offen" | "frei" | "aenderung" => {
    const fb = feedback.filter((f) => f.productId === produktId && f.slot === slot && f.autorTyp === "kunde");
    if (fb.some((f) => f.art === "aenderung" && f.status === "offen")) return "aenderung";
    if (fb.some((f) => f.art === "freigabe")) return "frei";
    return "offen";
  };
  const offeneBausteine = produkte.flatMap((p) => p.slots.filter(sichtbar).filter((sl) => kundenStatus(p.id, sl.slot) === "offen")).length;
  const gesamtBausteine = produkte.flatMap((p) => p.slots.filter(sichtbar)).length;

  // Bausteine für den fokussierten Durchgang — einer nach dem anderen.
  const stepperBausteine =
    produkte.flatMap((p) =>
      p.slots.filter(sichtbar).map((sl) => {
        const st = kundenStatus(p.id, sl.slot);
        return {
          key: `${p.id}:${sl.slot}`,
          produktName: p.name,
          label: sl.label,
          werte: sl.werte,
          bildUrl: sl.kind === "image" ? sl.werte[0] : null,
          erledigt: st !== "offen",
          statusText: st === "frei" ? "von Ihnen freigegeben" : st === "aenderung" ? "Änderung angefragt" : undefined,
          productId: p.id,
          slot: sl.slot,
          versionId: sl.versionId,
        };
      }),
    );

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <header>
        <div className="text-[11px] uppercase tracking-wide text-muted">Content-Freigabe · {brand.name}</div>
        <h1 className="page-title mt-1">{share.label}</h1>
        <p className="page-sub">
          {kontakt ? `Guten Tag ${kontakt.name}, hier` : "Hier"} sehen Sie den für Ihre Produkte erarbeiteten Content.
          Sie können zu jedem Baustein direkt eine Rückmeldung hinterlassen
          {share.darfFreigeben ? " oder ihn freigeben" : ""}.
        </p>
        {share.expiresAt && (
          <p className="mt-2 text-xs text-muted">Dieser Link ist gültig bis {share.expiresAt.toLocaleDateString("de-DE")}.</p>
        )}
      </header>

      {gesamtBausteine > 0 && (
        <div className="mt-4 rounded-xl border border-hair bg-[var(--primary-soft)] px-4 py-3 text-sm text-primary-strong">
          {offeneBausteine > 0
            ? <><b>{offeneBausteine} von {gesamtBausteine} Bausteinen</b> warten auf Ihre Rückmeldung.</>
            : <>Alles gesichtet — <b>vielen Dank!</b> Ihre Freigaben sind bei uns angekommen.</>}
        </div>
      )}

      {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.1)] px-3 py-2 text-sm text-bad">{fehler}</p>}

      {produkte.length === 0 && <p className="mt-6 card p-4 text-sm text-muted">Für diese Freigabe liegt noch kein Content bereit.</p>}

      {/* Fokussierter Durchgang: ein Baustein nach dem anderen (Nutzer-Wunsch 23.07.) */}
      {stepperBausteine.length > 0 && (
        <div className="mt-5">
          <FreigabeStepper
            variant="kunde"
            action={kundenFeedback}
            leerText="Alles gesichtet — vielen Dank!"
            bausteine={stepperBausteine.map((item) => ({
              key: item.key,
              produktName: item.produktName,
              label: item.label,
              werte: item.werte,
              bildUrl: item.bildUrl,
              erledigt: item.erledigt,
              statusText: item.statusText,
              darfFreigeben: share.darfFreigeben,
              nameFeld: !kontakt,
              fields: {
                token,
                productId: item.productId,
                slot: item.slot,
                ...(item.versionId ? { versionId: item.versionId } : {}),
              },
            }))}
          />
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-muted">Alle Bausteine am Stück ansehen</summary>

      {produkte.map((p) => (
        <section key={p.id} className="mt-5 card p-5">
          <h2 className="text-base font-semibold">{p.name}</h2>
          {p.asin && <p className="mt-0.5 font-mono text-xs text-muted">{p.asin}</p>}

          {p.slots
            .filter((s) => s.status === "freigegeben" && s.werte.length > 0 && s.kind !== "aplus")
            .map((s) => {
              const eigenes = feedback.filter((f) => f.productId === p.id && f.slot === s.slot);
              return (
                <article key={s.slot} className="mt-4 rounded-xl border border-hair p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{s.label}</h3>
                    {(() => {
                      const st = kundenStatus(p.id, s.slot);
                      if (st === "frei") return <span className="pill pill-good">von Ihnen freigegeben</span>;
                      if (st === "aenderung") return <span className="pill pill-bad">Änderung angefragt</span>;
                      return <span className="pill pill-warn">wartet auf Ihre Rückmeldung</span>;
                    })()}
                  </div>

                  {s.kind === "image" ? (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.werte[0]} alt={s.label} className="max-h-64 rounded-lg border border-hair" />
                    </div>
                  ) : s.werte.length > 1 ? (
                    <ul className="mt-2 space-y-1.5">
                      {s.werte.map((w, i) => (
                        <li key={i} className="text-sm leading-relaxed">
                          <span className="mr-1.5 text-muted">{i + 1}.</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.werte[0]}</p>
                  )}

                  {eigenes.filter((f) => f.nachricht).length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-hair pt-3">
                      {eigenes.filter((f) => f.nachricht).map((f) => {
                        const vomKunden = f.autorTyp === "kunde";
                        return (
                          <div key={f.id} className={`flex ${vomKunden ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${vomKunden ? "bg-primary text-white" : "bg-[var(--sunk,rgb(0_0_0/0.04))] border border-hair"}`}>
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

                  <form action={kundenFeedback} className="mt-3 grid gap-2">
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="slot" value={s.slot} />
                    {s.versionId && <input type="hidden" name="versionId" value={s.versionId} />}
                    {!kontakt && <input name="name" placeholder="Ihr Name" className="input-base text-sm" />}
                    <textarea name="nachricht" rows={2} className="input-base text-sm" placeholder="Ihre Rückmeldung zu diesem Baustein …" />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton name="art" value="kommentar" className="btn-ghost text-xs">Rückmeldung senden</SubmitButton>
                      <SubmitButton name="art" value="aenderung" className="btn-dark text-xs">Änderung wünschen</SubmitButton>
                      {share.darfFreigeben && (
                        <SubmitButton name="art" value="freigabe" className="btn-primary text-xs">Freigeben</SubmitButton>
                      )}
                    </div>
                  </form>
                </article>
              );
            })}

          {p.slots.every((s) => s.status !== "freigegeben") && (
            <p className="mt-3 text-sm text-muted">Für dieses Produkt ist noch nichts zur Freigabe fertig.</p>
          )}
        </section>
      ))}

      </details>

      <p className="mt-8 text-center text-[11px] text-muted">temoa OS · Content-Freigabe</p>
    </main>
  );
}
