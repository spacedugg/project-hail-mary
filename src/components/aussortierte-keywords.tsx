"use client";

import { useState } from "react";

/**
 * Aussortierte Keywords sichtbar + durchsuchbar (D165, Nutzer-Vorgabe: nichts
 * Wichtiges in Dropdowns verstecken). Suche filtert live; Klick auf ↩ nimmt
 * das Keyword wieder in die Basis auf.
 */
export function AussortierteKeywords({
  eintraege,
  productId,
  action,
}: {
  eintraege: Array<{ id: string; keyword: string; searchVolume: number | null; grund: string | null }>;
  productId: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [suche, setSuche] = useState("");
  if (eintraege.length === 0) return null;
  const q = suche.toLowerCase().trim();
  const gefiltert = q ? eintraege.filter((e) => e.keyword.toLowerCase().includes(q) || (e.grund ?? "").toLowerCase().includes(q)) : eintraege;
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

  return (
    <div className="mt-3 rounded-xl border border-hair p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-warn">Aussortiert ({eintraege.length})</h3>
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suchen …"
          className="input w-44 text-xs"
        />
      </div>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {gefiltert.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1 text-xs">
            <span className="min-w-0">
              <b>{k.keyword}</b>
              {k.searchVolume ? <span className="text-muted"> · SV {fmt(k.searchVolume)}</span> : null}
              {k.grund && <span className="block text-[11px] text-muted">{k.grund}</span>}
            </span>
            <form action={action} className="flex-none">
              <input type="hidden" name="keywordId" value={k.id} />
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="aktion" value="aufnehmen" />
              <button type="submit" className="btn-ghost px-2 py-0.5 text-[11px] !text-good" title="Wieder aufnehmen">↩ aufnehmen</button>
            </form>
          </li>
        ))}
        {gefiltert.length === 0 && <li className="px-2 py-1 text-xs text-muted">Kein Treffer.</li>}
      </ul>
    </div>
  );
}
