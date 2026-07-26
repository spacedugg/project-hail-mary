import Link from "next/link";
import { notFound } from "next/navigation";
import { ladeMarkenCms, ladeOffeneFreigaben, KERN_SLOTS } from "@/lib/cms/laden";
import { publishBereit } from "@/lib/amazon/publishGate";
import { createProduct, deleteProductAction, produkteOhneSnapshot } from "@/app/actions";
import { onboardingProdukteAnlegen } from "@/app/cms-actions";
import { OnboardingImport } from "@/components/onboarding-import";
import { LoeschButton } from "@/components/loesch-button";
import { SubmitButton } from "@/components/submit-button";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";

export const dynamic = "force-dynamic";

/**
 * Katalog — die Produkt-Zentrale der Marke. Jede Zeile ist ein Produkt mit
 * seinem Content-Zustand (Soll/Live/Abgesichert/Publish/Wartet); ein Klick öffnet
 * alles zum Produkt. Die Content-ERSTELLUNG (Werkstatt) bleibt im Produkt; hier
 * ist der Einstieg + der Content-Verwaltungs-Überblick (E-Feature).
 */
export default async function BrandKatalog({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ fehler?: string; code?: string; hinweis?: string }>;
}) {
  const { brandId } = await params;
  const { fehler, code, hinweis } = await searchParams;
  const cms = await ladeMarkenCms(brandId);
  if (!cms) notFound();
  const freigaben = await ladeOffeneFreigaben(brandId);
  const ohneSnapshot = await produkteOhneSnapshot(brandId);
  const input = "input-base";

  return (
    <main className="w-full p-8">
      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}
      {hinweis && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm text-primary-strong">ℹ {hinweis}</p>}

      <h1 className="page-title">Katalog</h1>
      <p className="page-sub">Produkte dieser Marke. Die meisten ASINs existieren schon — anlegen, dann Daten anbinden.</p>

      <form action={createProduct} className="mt-5 flex flex-wrap gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input name="name" placeholder="Produktname *" required className={`${input} min-w-48 flex-1`} />
        <input name="marke" placeholder="Marke *" required className={`${input} w-40`} />
        <input name="asin" placeholder="ASIN (B0…) *" required pattern="[Bb][A-Za-z0-9]{9}" className={`${input} w-40 font-mono`} />
        {/* Marktplatz beim Anlegen (D128): Import & Scrapes laufen gegen diese Domain — die ASIN allein verrät ihn nicht */}
        <select name="marketplace" defaultValue="de" className={`${input} w-36`} title="Marktplatz — Listing-Import und Review-Scrapes laufen gegen diese Amazon-Domain">
          <option value="de">amazon.de</option>
          <option value="uk">amazon.co.uk</option>
          <option value="us">amazon.com</option>
          <option value="fr">amazon.fr</option>
          <option value="it">amazon.it</option>
          <option value="es">amazon.es</option>
          <option value="nl">amazon.nl</option>
        </select>
        <select name="contentSprache" defaultValue="de" className={`${input} w-40`}>
          <option value="de">Content: Deutsch</option>
          <option value="en">Content: Englisch</option>
          <option value="fr">Content: Französisch</option>
          <option value="it">Content: Italienisch</option>
          <option value="es">Content: Spanisch</option>
        </select>
        <SubmitButton className="btn-primary">
          + Produkt
        </SubmitButton>
      </form>

      <details className="mt-3 rounded-xl border border-hair p-3.5">
        <summary className="cursor-pointer text-sm font-semibold">
          Massenimport mit ASIN Liste
        </summary>
        <p className="mt-2 text-xs text-muted">
          Zum Start der Zusammenarbeit: alle ASINs des Kunden einfügen (eine je Zeile oder durch Komma getrennt).
          Das Tool legt die Produkte an; danach ziehst du unten alle Live-Listings in einem Zug. Es entsteht nur der
          <b> Status quo</b> — kein Archiv alter Content-Stände.
        </p>
        <form action={onboardingProdukteAnlegen} className="mt-2 grid gap-2">
          <input type="hidden" name="brandId" value={brandId} />
          <textarea name="asins" rows={3} className="input-base font-mono text-sm" placeholder="B0B1WQQHMH&#10;B0CXY12ABC, B0DEF34GHI …" />
          <SubmitButton className="btn-dark w-fit text-xs">Produkte anlegen</SubmitButton>
        </form>
      </details>

      {ohneSnapshot.length > 0 && (
        <div className="mt-3">
          <OnboardingImport produkte={ohneSnapshot} />
        </div>
      )}

      {cms.produkte.length === 0 ? (
        <p className="mt-6 card p-5 text-sm text-muted">
          Noch kein Produkt. Lege eines mit ASIN an — danach holt sich das Tool das Listing selbst.
        </p>
      ) : (
        <div className="mt-5 card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2.5 pl-5 pr-3">Produkt</th>
                <th className="py-2.5 pr-3" title="Freigegebene Kern-Plätze: Titel, Bullets, Beschreibung, Backend-Keywords, Hauptbild">Soll</th>
                <th className="py-2.5 pr-3" title="Anteil unseres Solls, der live auf Amazon steht">Live</th>
                <th className="py-2.5 pr-3">Abgesichert</th>
                <th className="py-2.5 pr-3">Publish</th>
                <th className="py-2.5 pr-3">Wartet</th>
                <th className="py-2.5 pr-5"></th>
              </tr>
            </thead>
            <tbody>
              {cms.produkte.map((p) => {
                const wartet = freigaben.filter((f) => f.productId === p.id).length;
                const bereit = publishBereit(p.publishIssues);
                const titel = p.liveTitle ?? (p.name && p.name !== p.asin ? p.name : null);
                return (
                  // Ganze Zeile klickbar (D…): der Titel-Link spannt per ::after über die
                  // Zeile (tr = relative). Aktionen rechts liegen mit z-10 darüber.
                  <tr key={p.id} className="group relative border-b border-hair/60 transition-colors last:border-0 hover:bg-[var(--primary-soft)]">
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        {p.bildUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.bildUrl} alt="" className="h-11 w-11 flex-none rounded-lg border border-hair bg-white object-contain" />
                        ) : (
                          <div className="grid h-11 w-11 flex-none place-items-center rounded-lg border border-hair bg-neutral-100 text-xs text-muted dark:bg-neutral-800">–</div>
                        )}
                        <div className="min-w-0">
                          <Link href={`/produkte/${p.id}`} className="font-mono text-[13px] font-medium after:absolute after:inset-0 group-hover:underline">
                            {p.asin ?? <span className="font-sans text-warn">ohne ASIN</span>}
                          </Link>
                          <div className="mt-0.5 truncate text-[12px] text-muted">
                            {titel ?? <span className="italic">Titel folgt nach Listing-Import</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                            <span>{p.marketplace.toUpperCase()}</span>
                            {p.skuIstNotbehelf && <span className="pill pill-warn">SKU fehlt</span>}
                            {!p.productType && <span className="pill pill-warn">Produkttyp fehlt</span>}
                            {p.sollAusIst > 0 && <span className="pill pill-neutral">{p.sollAusIst}× nur Ausgangs-Stand</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 tabular-nums">
                      <span className={p.kernFreigegeben === 5 ? "text-good" : p.kernFreigegeben === 0 ? "text-muted" : ""}>
                        {p.kernFreigegeben}/5
                      </span>
                    </td>
                    <td className="py-3 pr-3 tabular-nums">
                      {p.abgleich.accuracyPct === null ? (
                        <span className="text-muted" title="Kein gecrawlter Live-Stand">–</span>
                      ) : (
                        <span className={p.abgleich.accuracyPct >= 95 ? "text-good" : "text-bad"}>{p.abgleich.accuracyPct} %</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 tabular-nums">
                      {(() => {
                        const kern = p.slots.filter((s) => KERN_SLOTS.includes(s.slot) && s.werte.length > 0);
                        const ok = kern.filter((s) => s.freigabe.abgesichert).length;
                        if (!kern.length) return <span className="text-muted">—</span>;
                        return (
                          <span
                            className={ok === kern.length ? "text-good" : "text-muted"}
                            title="Vom Kunden freigegebene Kern-Plätze"
                          >
                            {ok}/{kern.length}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={bereit ? "pill pill-good" : "pill pill-bad"}>{bereit ? "bereit" : "blockiert"}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="relative z-10 flex w-fit flex-wrap gap-1.5">
                        {wartet > 0 && (
                          <Link href={`/marke/${brandId}/publish`} className="pill pill-warn">{wartet}× Freigabe</Link>
                        )}
                        {p.feedbackOffen > 0 && (
                          <Link href={`/produkte/${p.id}/content`} className="pill pill-neutral">{p.feedbackOffen}× Feedback</Link>
                        )}
                        {wartet === 0 && p.feedbackOffen === 0 && <span className="text-xs text-muted">—</span>}
                      </div>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="relative z-10 flex items-center justify-end">
                        <LoeschButton
                          action={deleteProductAction}
                          felder={{ productId: p.id }}
                          frage={`„${p.name}" aus dem Katalog löschen? Content, Bewertungen und Alerts gehen weg — das Amazon-Listing bleibt.`}
                          title="Produkt löschen"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        <b>Soll</b> = wie viele der fünf Kern-Plätze freigegeben sind (Titel, Bullets, Beschreibung, Backend-Keywords, Hauptbild).{" "}
        <b>Live</b> = wie viel davon auf Amazon steht — keine Qualitätsnote.{" "}
        Markenweite Aufgaben stehen unter{" "}
        <Link href={`/marke/${brandId}/publish`} className="underline">Content-Verwaltung</Link>.
      </p>
    </main>
  );
}
