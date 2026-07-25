"use client";

import { useState } from "react";

/**
 * Ein-Klick-Kopieren für Links (Kunden-Portal, Freigabe-Links).
 * Zeigt kurz „Kopiert ✓", damit man sieht, dass es geklappt hat — genau die
 * Rückmeldung, die beim manuellen Markieren fehlt.
 */
export function CopyLink({ url, className = "" }: { url: string; className?: string }) {
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback für Kontexte ohne Clipboard-API (z. B. unsicherer Origin).
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setKopiert(true);
    setTimeout(() => setKopiert(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={kopieren}
      className={className || "btn-dark text-xs"}
      aria-live="polite"
    >
      {kopiert ? "Kopiert ✓" : "Link kopieren"}
    </button>
  );
}
