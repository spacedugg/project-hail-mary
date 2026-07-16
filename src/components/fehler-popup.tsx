"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Fehler-Popup (D101, Nutzer-Vorgabe): Fehler erscheinen als Dialog, der erst
 * nach bewusstem Klick verschwindet — mit Fehlercode, Detail-Meldung, was der
 * Code bedeutet und wie man den Fehler behebt. Beim Schließen werden die
 * fehler/code-Query-Parameter entfernt, damit ein Reload das Popup nicht
 * erneut zeigt.
 */
export function FehlerPopup({
  code,
  titel,
  message,
  bedeutung,
  loesung,
}: {
  code: string;
  titel: string;
  message: string;
  bedeutung: string;
  loesung: string;
}) {
  const [offen, setOffen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!offen) return null;

  const schliessen = () => {
    setOffen(false);
    const params = new URLSearchParams(searchParams);
    params.delete("fehler");
    params.delete("code");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="alertdialog" aria-modal="true" aria-labelledby="fehler-titel">
      <div className="card w-full max-w-lg p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip bg-[rgb(220_38_38/0.12)] text-bad">✕</span>
            <div>
              <h2 id="fehler-titel" className="text-sm font-semibold">{titel}</h2>
              <span className="pill pill-bad mt-1 font-mono text-[10px]">Fehlercode {code}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad">{message}</p>
        <div className="mt-3 space-y-2 text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Was das bedeutet</div>
            <p className="mt-0.5 text-muted">{bedeutung}</p>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">So behebst du es</div>
            <p className="mt-0.5 text-muted">{loesung}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={schliessen} autoFocus>
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
