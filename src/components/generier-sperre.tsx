"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Serialisierung der Text-Generierung (D109, Nutzer-Befund): Server-Actions
 * laufen pro Browser-Tab NACHEINANDER — wer drei Sektionen gleichzeitig
 * anstößt, stellt die späteren in eine Warteschlange, bis sie ins Zeitlimit
 * laufen („unexpected response"). Deshalb: Während eine Generierung läuft,
 * sind alle anderen Generieren-Buttons gesperrt und sagen warum.
 */

const SperrKontext = createContext<{ laeuft: boolean; setLaeuft: (b: boolean) => void }>({
  laeuft: false,
  setLaeuft: () => {},
});

export function GenerierSperre({ children }: { children: React.ReactNode }) {
  const [laeuft, setLaeuft] = useState(false);
  return <SperrKontext.Provider value={{ laeuft, setLaeuft }}>{children}</SperrKontext.Provider>;
}

/** Submit-Button, der alle Geschwister sperrt, solange irgendeine Generierung läuft. */
export function GenerierButton({
  children,
  className = "btn-primary px-3 py-1 text-xs",
  pendingLabel = "Generiert…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const { laeuft, setLaeuft } = useContext(SperrKontext);

  useEffect(() => {
    if (pending) setLaeuft(true);
    else setLaeuft(false);
    // beim Unmount nie gesperrt zurücklassen
    return () => setLaeuft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const fremdGesperrt = laeuft && !pending;
  return (
    <span className={pending ? "inline-flex flex-col gap-1.5" : "contents"}>
      <button
        className={className}
        disabled={pending || fremdGesperrt}
        aria-busy={pending}
        title={fremdGesperrt ? "Eine andere Sektion wird gerade generiert — Anfragen laufen nacheinander." : undefined}
      >
        {pending && <span className="spinner mr-1.5 align-[-0.1em]" aria-hidden />}
        {pending ? pendingLabel : fremdGesperrt ? "⏳ wartet…" : children}
      </button>
      {pending && <span className="progress-indeterminate w-full" role="progressbar" aria-label="läuft" />}
    </span>
  );
}
