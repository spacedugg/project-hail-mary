import { saveContentPlan } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { SEKTIONS_REIHENFOLGE, SEKTIONS_LABEL, wirksamerPlan } from "@/lib/content/plan";
import { WERKE_REIHENFOLGE, WERK_LABEL, WERK_HINWEIS, wirksameWerke, type Werk } from "@/lib/content/werke";
import type { ListingSection } from "@/lib/recipes/listing";

/**
 * Auftragsumfang-Auswahl (D270, Nutzer-Vorgabe 31.07.2026: „nicht immer muss
 * jeder Content generiert werden — wichtig ist, dass man sich das auswählen und
 * dann generieren kann").
 *
 * EIN Formular, drei Einsatzorte: Produkt-Arbeitsplatz (Einzel-ASIN),
 * Übertragungs-Maske einer Variations-Familie (D261, dort gilt es für alle
 * Varianten) und Briefings-Reiter (dort wird A+/Store beauftragt). Drei Kopien
 * dieser Auswahl würden garantiert auseinanderlaufen.
 *
 * Zwei Ebenen: oben das WERK (Listing · Bilder-Briefing · A+ Basic · A+ Premium ·
 * Store), darunter eingerückt die SEKTIONEN des Listings (D257) — sie sind
 * Bausteine INNERHALB eines Werks, keine gleichrangige Auswahl.
 */
export function WerkAuswahl({
  productId,
  werkePlan,
  contentPlan,
  ueberschrift = "Was soll erstellt werden?",
}: {
  productId: string;
  werkePlan: Werk[] | null;
  contentPlan: ListingSection[] | null;
  ueberschrift?: string;
}) {
  const werkeAktiv = wirksameWerke(werkePlan);
  const planAktiv = wirksamerPlan(contentPlan);

  return (
    <form action={saveContentPlan} className="mt-3 rounded-xl border border-hair p-3">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-xs font-semibold">{ueberschrift}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        Nur Angehaktes wird erzeugt — auswählen, speichern, dann erzeugen.
        {werkePlan == null ? " Noch nicht festgelegt: aktuell nur Listing-Texte." : ""}
      </p>
      <div className="mt-2 space-y-2">
        {WERKE_REIHENFOLGE.map((w) => (
          <div key={w}>
            <label className="flex items-baseline gap-1.5 text-xs">
              <input type="checkbox" name="werke" value={w} defaultChecked={werkeAktiv.includes(w)} />
              <span className="font-medium">{WERK_LABEL[w]}</span>
            </label>
            <p className="ml-5 text-[11px] text-muted">{WERK_HINWEIS[w]}</p>
            {w === "listing" && (
              <div className="ml-5 mt-1 flex flex-wrap gap-x-4 gap-y-1.5 border-l border-hair pl-3">
                {SEKTIONS_REIHENFOLGE.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox" name="sections" value={s} defaultChecked={planAktiv.includes(s)} />
                    {SEKTIONS_LABEL[s]}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <SubmitButton className="btn-dark mt-2 text-xs">Auswahl speichern</SubmitButton>
    </form>
  );
}
