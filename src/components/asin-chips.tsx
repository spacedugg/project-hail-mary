"use client";

import { useState } from "react";

/**
 * ASIN-Chip-Eingabe (D95, Nutzer-Vorgabe): Leertaste, Komma oder Enter macht
 * aus der getippten ASIN einen farblich markierten Chip — so ist SICHTBAR,
 * dass das System sie als EINEN Wert erkannt hat, bevor die nächste getippt
 * wird. Einfügen ganzer Listen (mit Leerzeichen/Kommas getrennt) funktioniert
 * genauso. Die Haupt-ASIN ist als Chip vorbelegt (Default „mit dabei"), kann
 * aber entfernt werden. Abgeschickt wird NUR, was als Chip steht — das
 * versteckte Feld trägt die kommagetrennte Liste.
 */

const ASIN_RE = /^B[A-Z0-9]{9}$/;

export function AsinChips({
  name,
  mainAsin,
  placeholder = "ASIN eingeben …",
}: {
  name: string;
  mainAsin?: string | null;
  placeholder?: string;
}) {
  const main = mainAsin?.trim().toUpperCase() ?? null;
  const [chips, setChips] = useState<string[]>(main ? [main] : []);
  const [draft, setDraft] = useState("");
  const [warnung, setWarnung] = useState<string | null>(null);

  const uebernehmen = (text: string) => {
    const tokens = text.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (tokens.length === 0) return;
    const gueltig = tokens.filter((t) => ASIN_RE.test(t));
    const kaputt = tokens.filter((t) => !ASIN_RE.test(t));
    if (gueltig.length) setChips((prev) => [...prev, ...gueltig.filter((t) => !prev.includes(t))]);
    setDraft(kaputt.join(" "));
    setWarnung(kaputt.length ? `Keine ASIN (Format B + 9 Zeichen): ${kaputt.join(", ")}` : null);
  };

  return (
    <div className="min-w-0 flex-1">
      <input type="hidden" name={name} value={chips.join(",")} />
      <div className="input-base flex min-h-9 flex-wrap items-center gap-1.5 !py-1.5 focus-within:[outline:2px_solid_var(--primary)]">
        {chips.map((asin) => (
          <span
            key={asin}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
              asin === main ? "bg-teal-600/15 text-teal-700 dark:text-teal-300" : "bg-violet-600/15 text-violet-700 dark:text-violet-300"
            }`}
          >
            {asin === main && <span className="font-sans font-normal opacity-70">Produkt ·</span>}
            {asin}
            <button
              type="button"
              aria-label={`${asin} entfernen`}
              className="opacity-60 transition hover:opacity-100"
              onClick={() => setChips((prev) => prev.filter((c) => c !== asin))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            // Leertaste/Komma im Tippfluss → sofort zum Chip machen
            if (/[\s,;]/.test(e.target.value)) uebernehmen(e.target.value);
            else { setDraft(e.target.value); setWarnung(null); }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); uebernehmen(draft); } // Enter macht Chip, schickt NICHT ab
            if (e.key === "Backspace" && draft === "") setChips((prev) => prev.slice(0, -1));
          }}
          onBlur={() => uebernehmen(draft)}
          placeholder={chips.length === 0 ? placeholder : "+ weitere ASIN …"}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {warnung ? <span className="text-warn">△ {warnung}</span> : "Leertaste, Komma oder Enter trennt — jede erkannte ASIN wird zum farbigen Chip. Chips lassen sich mit × entfernen."}
      </p>
    </div>
  );
}
