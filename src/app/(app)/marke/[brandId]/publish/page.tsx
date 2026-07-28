import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeOffeneFreigaben, ladeErledigteFreigaben } from "@/lib/cms/laden";
import { approveContent } from "@/app/actions";
import { anKundenSchicken } from "@/app/cms-actions";
import { ladeMarkenCms } from "@/lib/cms/laden";
import { PILL_KLASSE } from "@/lib/cms/freigabestand";
import { SubmitButton } from "@/components/submit-button";
import { FreigabeStepper } from "@/components/freigabe-stepper";

export const dynamic = "force-dynamic";

/**
 * Freigabe-Eingang für die Person, die die Marke verantwortet.
 *
 * Vorher hing die Abnahme verstreut in den einzelnen Produkten — niemand sah,
 * was insgesamt auf ihn wartet. Hier steht es in einer Liste, über alle
 * Produkte, mit dem vollen Wortlaut zum Prüfen und einem Klick zum Abnehmen.
 *
 * Bewusst getrennt vom Kunden-Feedback: Das hier ist die INTERNE Abnahme.
 * Die Zustimmung des Kunden läuft über den Freigabe-Link.
 */
export default async function Freigaben({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  if (!brand) notFound();

  const offen = await ladeOffeneFreigaben(brandId);
  const erledigt = await ladeErledigteFreigaben(brandId);
  // Produkt-zentriert gruppieren (D235, Nutzer-Wunsch): nicht mehr eine flache Baustein-Liste
  // quer über alle Produkte — sondern je Produkt, mit Anzahl offener Freigaben.
  const offenProProdukt = Object.values(
    offen.reduce(
      (acc, f) => {
        (acc[f.productId] ??= { productId: f.productId, produktName: f.produktName, items: [] as typeof offen }).items.push(f);
        return acc;
      },
      {} as Record<string, { productId: string; produktName: string; items: typeof offen }>,
    ),
  ).sort((a, b) => b.items.length - a.items.length);
  // Für den zweiten Abschnitt: intern abgenommene Stände, die noch auf den
  // Kunden warten. Das ist der Teil der Kette, der vorher nirgends sichtbar war.
  const cms = await ladeMarkenCms(brandId);
  const beimKunden = (cms?.produkte ?? []).flatMap((p) =>
    p.slots
      .filter((sl) => ["intern", "beim_kunden", "kunde_aenderung", "kunde_frei"].includes(sl.freigabe.stufe))
      .map((sl) => ({ produkt: p.name, produktId: p.id, slot: sl })),
  );

  return (
    <>
      <section className="mt-5 card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Wartet auf deine Abnahme</h2>
          <span className="text-xs text-muted">{offen.length} Stand/Stände · {offenProProdukt.length} Produkt(e)</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          <b>Nach Produkt gruppiert:</b> Jede Zeile ist ein Produkt mit der Anzahl offener Freigaben. Aufklappen zeigt
          NUR die Stände dieses Produkts — als jeweils <i>neuester</i> Stand je Sektion. Ein Stand verschwindet, sobald du
          ihn freigibst oder ein neuerer ihn ersetzt. Was die Prüfung nicht besteht, ist Werkstatt-Arbeit, keine Freigabe.
        </p>

        {/* Produkt-zentriert (D235): Produktliste mit Anzahl; aufklappen → nur dessen Freigaben. */}
        {offenProProdukt.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nichts offen — alles abgenommen.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {offenProProdukt.map((pp) => (
              <details key={pp.productId} className="rounded-xl border border-hair p-3">
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="font-medium">{pp.produktName}</span>
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-primary-strong">
                    {pp.items.length} Freigabe{pp.items.length === 1 ? "" : "n"} offen
                  </span>
                </summary>
                <div className="mt-3">
                  <FreigabeStepper
                    variant="intern"
                    action={approveContent}
                    leerText="—"
                    bausteine={pp.items.map((f) => ({
                      key: f.versionId,
                      produktName: f.produktName,
                      label: `${f.label} · v${f.version}`,
                      werte: f.werte,
                      erledigt: false,
                      statusText: f.generiertVon ?? "manuell",
                      fields: { productId: f.productId, versionId: f.versionId },
                      werkstattHref: `/produkte/${f.productId}`,
                    }))}
                  />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* ── Zweite Hälfte der Kette: vom Kunden absichern ─────────────── */}
      <section className="mt-4 card p-5">
        <h2 className="sect-h">Beim Kunden absichern</h2>
        <p className="mt-1 text-xs text-muted">
          Intern abgenommen heißt noch nicht abgesichert. Der Kunde sieht diesen Stand bereits auf seinem
          <b> Portal</b> — schicken musst du nichts. Der Klick setzt nur den Status auf &bdquo;beim Kunden&ldquo;,
          damit du hier siehst, worauf du noch auf Antwort wartest. Antwortet er, springt der Status um.
        </p>
        {beimKunden.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Kein intern abgenommener Stand vorhanden.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {beimKunden.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 border-b border-hair/60 pb-1.5 text-xs">
                <Link href={`/produkte/${b.produktId}/content`} className="font-medium hover:underline">{b.produkt}</Link>
                <span className="text-muted">· {b.slot.label}</span>
                <span className={PILL_KLASSE[b.slot.freigabe.ton]}>{b.slot.freigabe.label}</span>
                {b.slot.freigabe.detail && <span className="text-muted">{b.slot.freigabe.detail}</span>}
                {b.slot.freigabe.stufe === "intern" && b.slot.versionId && (
                  <form action={anKundenSchicken} className="ml-auto">
                    <input type="hidden" name="brandId" value={brandId} />
                    <input type="hidden" name="versionId" value={b.slot.versionId} />
                    <SubmitButton className="btn-dark text-[11px]">Als beim Kunden markieren</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted">
          Den festen <b>Portal-Link</b> für diese Marke findest du unter{" "}
          <Link href={`/marke/${brandId}/publish/feedback`} className="underline">Kunden-Feedback</Link> —
          dort steht auch der Schalter &bdquo;Publish erst nach Kundenfreigabe&ldquo;.
        </p>
      </section>

      <section className="mt-4 card p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Bereits abgenommen <span className="font-normal text-muted">({erledigt.length})</span>
          </summary>
          {erledigt.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Noch nichts freigegeben.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {erledigt.map((e) => (
                <li key={e.versionId} className="flex flex-wrap items-center gap-2 border-b border-hair/60 pb-1.5 text-xs">
                  <Link href={`/produkte/${e.productId}/content`} className="font-medium hover:underline">{e.produktName}</Link>
                  <span className="text-muted">· {e.label} · v{e.version}</span>
                  <span className="ml-auto text-muted">
                    {e.approvedAt
                      ? `${e.approvedBy ? `${e.approvedBy} · ` : ""}${e.approvedAt.toLocaleDateString("de-DE")}`
                      : "Urheber nicht erfasst"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
    </>
  );
}
