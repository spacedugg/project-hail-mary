"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importiereProdukt } from "@/app/actions";

/**
 * Sammel-Import beim Kunden-Onboarding (Bauplan v3.6).
 *
 * Läuft Produkt für Produkt — jeder Listing-Import ist eine eigene Anfrage mit
 * eigenem Zeit- und Geldbudget (Scrape). Der Balken zeigt den echten Stand, kein
 * geschätztes Wischen. Gleiche Bauart wie „Alles generieren".
 */
export function OnboardingImport({
  produkte,
}: {
  produkte: Array<{ id: string; name: string; asin: string | null }>;
}) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [aktuell, setAktuell] = useState<string | null>(null);
  const [fertig, setFertig] = useState<Array<{ name: string; ok: boolean; meldung: string }>>([]);
  const [abbruch, setAbbruch] = useState(false);

  const gesamt = produkte.length;
  if (gesamt === 0) return null;

  async function los() {
    setLaeuft(true);
    setFertig([]);
    setAbbruch(false);
    const gesammelt: Array<{ name: string; ok: boolean; meldung: string }> = [];
    for (const p of produkte) {
      if (abbruch) break;
      setAktuell(p.asin ?? p.name);
      try {
        const r = await importiereProdukt(p.id);
        gesammelt.push({ name: r.name, ok: r.ok, meldung: r.meldung });
      } catch (e) {
        gesammelt.push({ name: p.name, ok: false, meldung: e instanceof Error ? e.message : String(e) });
      }
      setFertig([...gesammelt]);
    }
    setAktuell(null);
    setLaeuft(false);
    router.refresh();
  }

  const anteil = Math.round((fertig.length / gesamt) * 100);

  return (
    <div className="rounded-xl border border-hair p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Sammel-Import der Live-Listings</h3>
          <p className="mt-0.5 text-xs text-muted">
            {gesamt} Produkt(e) ohne Live-Stand. Jedes Ziehen dauert ~10–50 Sekunden und kostet einen Scrape.
          </p>
        </div>
        {laeuft ? (
          <button onClick={() => setAbbruch(true)} className="btn-ghost text-xs">Nach diesem stoppen</button>
        ) : (
          <button onClick={los} className="btn-primary text-xs">{gesamt} Listings laden</button>
        )}
      </div>

      {(laeuft || fertig.length > 0) && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">
              {laeuft ? `${fertig.length} von ${gesamt} · ${aktuell ?? "…"}` : `${fertig.length} von ${gesamt} geladen`}
            </span>
            <span className="tabular-nums text-muted">{anteil} %</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-hair" role="progressbar" aria-valuenow={anteil} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${anteil}%` }} />
          </div>
          <ul className="mt-2 space-y-1">
            {fertig.map((f, i) => (
              <li key={i} className="text-xs">
                <span className={f.ok ? "pill pill-good" : "pill pill-bad"}>{f.ok ? "geladen" : "Fehler"}</span>{" "}
                <b>{f.name}</b> <span className="text-muted">— {f.meldung}</span>
              </li>
            ))}
            {laeuft && aktuell && (
              <li className="text-xs text-muted"><span className="spinner mr-1.5 align-[-0.1em]" aria-hidden /> {aktuell} …</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
