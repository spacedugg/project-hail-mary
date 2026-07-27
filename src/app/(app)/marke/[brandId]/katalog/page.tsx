import Link from "next/link";
import { notFound } from "next/navigation";
import { ladeMarkenCms, ladeOffeneFreigaben, KERN_SLOTS } from "@/lib/cms/laden";
import { publishBereit } from "@/lib/amazon/publishGate";
import { createProduct, deleteProductAction, produkteOhneSnapshot } from "@/app/actions";
import { onboardingProdukteAnlegen } from "@/app/cms-actions";
import { OnboardingImport } from "@/components/onboarding-import";
import { KatalogZeile } from "@/components/katalog-zeile";
import { FamilieGruppieren } from "@/components/familie-gruppieren";
import { getDb } from "@/db/client";
import { ladeGruppierbar, ladeFamilienUebersicht } from "@/lib/variants/laden";
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
  const db = await getDb();
  const gruppierbar = await ladeGruppierbar(db, brandId);
  const familien = await ladeFamilienUebersicht(db, brandId);
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

      <details className="mt-3 rounded-xl border border-hair p-3.5">
        <summary className="cursor-pointer text-sm font-semibold">Variations-Familie (Parent-Child) anlegen</summary>
        <p className="mt-2 text-xs text-muted">
          Ähnliche Varianten (Geschmack, Größe, Farbe …) zu einer Familie zusammenfassen — danach wird Content für eine
          Variante freigegeben und stilgleich auf die anderen übertragen.
        </p>
        <div className="mt-3">
          <FamilieGruppieren brandId={brandId} produkte={gruppierbar} />
        </div>
        {familien.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Bestehende Familien</p>
            <ul className="mt-1.5 grid gap-1">
              {familien.map((f) => (
                <li key={f.id} className="text-sm">
                  <Link href={`/produkte/${f.id}`} className="underline">{f.name}</Link>
                  <span className="text-muted">
                    {" "}· {f.theme.join(", ") || "keine Achse"} · {f.kinderAnzahl} Varianten · {f.hatMaster ? "Master ✓" : "kein Master"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
                const titelVoll = p.liveTitle ?? (p.name && p.name !== p.asin ? p.name : null);
                const woerter = titelVoll ? titelVoll.trim().split(/\s+/) : [];
                const titelKurz = titelVoll ? woerter.slice(0, 5).join(" ") + (woerter.length > 5 ? " …" : "") : null;
                const kern = p.slots.filter((s) => KERN_SLOTS.includes(s.slot) && s.werte.length > 0);
                return (
                  <KatalogZeile
                    key={p.id}
                    id={p.id}
                    brandId={brandId}
                    bildUrl={p.bildUrl}
                    asin={p.asin}
                    titelKurz={titelKurz}
                    marketplace={p.marketplace}
                    skuFehlt={p.skuIstNotbehelf}
                    produkttypFehlt={!p.productType}
                    sollAusIst={p.sollAusIst}
                    kernFreigegeben={p.kernFreigegeben}
                    accuracyPct={p.abgleich.accuracyPct}
                    abgesichert={kern.length ? { ok: kern.filter((s) => s.freigabe.abgesichert).length, kern: kern.length } : null}
                    bereit={publishBereit(p.publishIssues)}
                    wartet={freigaben.filter((f) => f.productId === p.id).length}
                    feedbackOffen={p.feedbackOffen}
                    loeschFrage={`„${p.name}" aus dem Katalog löschen? Content, Bewertungen und Alerts gehen weg — das Amazon-Listing bleibt.`}
                    deleteAction={deleteProductAction}
                  />
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
