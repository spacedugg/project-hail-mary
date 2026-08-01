"use client";

import { useState } from "react";

/**
 * Aktive („grüne") Keywords — durchsuchbar (D274, Nutzer-Vorgabe 01.08.2026).
 *
 * „Ich hätte gerne auch eine Suchfunktion bei den grünen Keywords. Dann werden
 * mir alle Worte angezeigt, die diese Buchstaben enthalten, und dann kann ich
 * Keywords suchen, die ich noch ausschließen möchte."
 *
 * Vorher gab es die Suche NUR bei den aussortierten Keywords (D165) — genau
 * verkehrt herum: Kuratiert wird die aktive Liste. Bei einer Cerebro-Basis mit
 * mehreren hundert Chips war ein Störwort („kinder", eine Fremdmarke, eine
 * falsche Größe) nur durch Scrollen zu finden.
 *
 * Zwei Wege, dieselbe Menge: einzeln per × oder alle Treffer auf einmal. Der
 * Sammel-Ausschluss ist der eigentliche Zweck der Suche — wer nach einem
 * Störwort filtert, will nicht 30-mal klicken.
 */

type Kw = { id: string; keyword: string; searchVolume: number | null; tier: string };

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const TIERS = ["primary", "secondary", "tertiary", "backend"] as const;

export function AktiveKeywords({
  eintraege,
  productId,
  toggleAction,
  sammelAction,
}: {
  eintraege: Kw[];
  productId: string;
  /** Einzelne Relevanz-Entscheidung (bestehend, D87). */
  toggleAction: (formData: FormData) => void | Promise<void>;
  /** Alle Treffer der Suche auf einmal ausschließen (D274). */
  sammelAction: (formData: FormData) => void | Promise<void>;
}) {
  const [suche, setSuche] = useState("");
  const q = suche.toLowerCase().trim();
  // Der Filter arbeitet auf der GESAMTEN aktiven Liste, nicht je Tier — ein
  // Störwort steckt selten nur in einer Stufe.
  const treffer = q ? eintraege.filter((k) => k.keyword.toLowerCase().includes(q)) : eintraege;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-good">Aktive Keywords ({eintraege.length})</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Keywords durchsuchen …"
            className="input w-56 text-xs"
            aria-label="Aktive Keywords durchsuchen"
          />
          {q && treffer.length > 0 && (
            <form action={sammelAction}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="suchbegriff" value={suche.trim()} />
              {treffer.map((k) => (
                <input key={k.id} type="hidden" name="keywordIds" value={k.id} />
              ))}
              <button className="btn-ghost px-2 py-1 text-[11px] !text-bad" title="Alle Treffer als irrelevant markieren">
                Alle {treffer.length} Treffer ausschließen
              </button>
            </form>
          )}
        </div>
      </div>

      {q && (
        <p className="mt-1 text-[11px] text-muted">
          {treffer.length === 0
            ? `Kein aktives Keyword enthält „${suche.trim()}".`
            : `${treffer.length} von ${eintraege.length} Keywords enthalten „${suche.trim()}".`}
        </p>
      )}

      {TIERS.map((tier) => {
        const inTier = treffer.filter((k) => k.tier === tier);
        if (inTier.length === 0) return null;
        return (
          <div key={tier} className="mt-3">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400">{tier} · {inTier.length}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {/* ALLE Chips sichtbar + abwählbar (D190) — kein „+N"-Abschneiden:
                  Kuratieren braucht die volle Liste, jetzt zusätzlich filterbar. */}
              {inTier.map((k) => (
                <form key={k.id} action={toggleAction} className="inline-flex">
                  <input type="hidden" name="keywordId" value={k.id} />
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="aktion" value="ausschliessen" />
                  <span className="group/kw inline-flex items-center gap-1 rounded-full bg-[rgb(47_158_143/0.12)] px-2.5 py-1 text-xs text-good">
                    {k.keyword}{k.searchVolume ? ` · ${fmt(k.searchVolume)}` : ""}
                    <button title="Als irrelevant ausschließen" className="text-neutral-400 transition hover:text-bad">×</button>
                  </span>
                </form>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
