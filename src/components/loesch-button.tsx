"use client";

/**
 * Icon-Löschen mit Rückfrage (D162, Nutzer-Vorgabe): EIN Mülleimer-Symbol,
 * Klick → „Bist du sicher?"-Dialog → bestätigt = gelöscht. Kein Aufklapp-Text,
 * keine Checkbox. Wiederverwendbar für alles Löschbare (Produkte,
 * Keyword-Basis, …) — die Rückfrage benennt konkret, WAS gelöscht wird.
 */
export function LoeschButton({
  action,
  felder,
  frage,
  title = "Löschen",
  className = "rounded-lg p-1.5 text-neutral-400 transition hover:bg-[rgb(220_38_38/0.08)] hover:text-bad",
}: {
  action: (formData: FormData) => void | Promise<void>;
  felder: Record<string, string>;
  frage: string;
  title?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(frage)) e.preventDefault();
      }}
      className="contents"
    >
      {Object.entries(felder).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" title={title} aria-label={title} className={className}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </form>
  );
}
