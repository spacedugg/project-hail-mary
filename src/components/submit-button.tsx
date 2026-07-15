"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit-Button mit Klick-Rückmeldung (D69): sobald die Server-Action läuft,
 * erscheint der CI-Spinner, der Button sperrt sich; optional wechselt das
 * Label (pendingLabel) und bei langen Analysen zeigt `progress` zusätzlich
 * einen Indeterminate-Balken unter dem Button — visuelle Wartezeit,
 * bewusst ohne Fake-Prozente.
 */
export function SubmitButton({
  children,
  className = "btn-primary",
  pendingLabel,
  progress = false,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
  progress?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <span className={progress ? "inline-flex flex-col gap-1.5" : "contents"}>
      <button {...rest} disabled={disabled || pending} className={className} aria-busy={pending}>
        {pending && <span className="spinner mr-1.5 align-[-0.1em]" aria-hidden />}
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      {progress && pending && <span className="progress-indeterminate w-full" role="progressbar" aria-label="läuft" />}
    </span>
  );
}
