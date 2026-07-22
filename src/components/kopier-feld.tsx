"use client";

import { useState } from "react";

/**
 * Kopierbares Einzel-Feld (D175, Nutzer-Vorgabe 22.07.): jeder Content-Teil
 * (Titel, jeder Bullet, jedes Q&A-Paar …) ist EIN klickbares Feld — Klick
 * kopiert den Text. Der Zeichen-Hinweis ist neutral; ROT wird er NUR über
 * dem harten Amazon-Maximum, nie über einer Best-Practice-Länge.
 */
export function KopierFeld({
  text,
  label,
  max,
  bytes = false,
  mono = false,
}: {
  text: string;
  label?: string;
  /** Hartes Amazon-Maximum — nur dessen Überschreitung wird rot. */
  max?: number;
  /** true: Zählung in UTF-8-Bytes (Backend-Keywords) statt Zeichen. */
  bytes?: boolean;
  mono?: boolean;
}) {
  const [kopiert, setKopiert] = useState(false);
  const menge = bytes ? new TextEncoder().encode(text).length : text.length;
  const einheit = bytes ? "B" : "";
  const ueberMax = max !== undefined && menge > max;
  return (
    <button
      type="button"
      title="Klicken kopiert"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setKopiert(true);
        setTimeout(() => setKopiert(false), 1600);
      }}
      className="group relative block w-full rounded-xl border border-hair bg-background p-2.5 pr-20 text-left text-sm transition hover:border-[var(--primary)] active:scale-[0.995]"
    >
      {label && <span className="block text-[10px] uppercase tracking-wide text-muted">{label}</span>}
      <span className={`whitespace-pre-wrap ${mono ? "font-mono text-xs" : ""}`}>{text}</span>
      <span
        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] tabular-nums transition ${
          kopiert ? "bg-[rgb(47_158_143/0.15)] text-good" : ueberMax ? "bg-[rgb(220_38_38/0.1)] font-semibold text-bad" : "bg-hair text-muted"
        }`}
      >
        {kopiert ? "✓ kopiert" : max !== undefined ? `${menge}/${max}${einheit}` : `${menge}${einheit || " Zeichen"}`}
      </span>
    </button>
  );
}
