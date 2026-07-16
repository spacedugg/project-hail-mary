"use client";

/**
 * Globale Fehler-Grenze (D103): Wenn eine Seite beim Rendern crasht, sieht
 * der Nutzer NIE die nackte Next.js-Fehlerseite, sondern eine deutsche
 * Meldung im Stil der Fehler-Popups (D101) — mit Fehlercode, Erklärung und
 * einem Weg zurück. Letzte Verteidigungslinie; die eigentlichen Ursachen
 * werden weiter an der Wurzel behoben (Banner-/Popup-Prinzip D78/D101).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip bg-[rgb(220_38_38/0.12)] text-bad">✕</span>
          <div>
            <h1 className="text-sm font-semibold">Diese Seite ist auf einen Fehler gestoßen</h1>
            <span className="pill pill-bad mt-1 font-mono text-[10px]">Fehlercode ALG-00{error.digest ? ` · ${error.digest}` : ""}</span>
          </div>
        </div>
        {error.message && (
          <p className="mt-3 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad break-words">{error.message}</p>
        )}
        <div className="mt-3 space-y-2 text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Was das bedeutet</div>
            <p className="mt-0.5 text-muted">
              Beim Aufbau der Seite ist ein unerwarteter Fehler aufgetreten. Deine Daten sind davon nicht betroffen —
              gespeichert bleibt gespeichert.
            </p>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">So behebst du es</div>
            <p className="mt-0.5 text-muted">
              Einmal „Erneut versuchen" klicken. Bleibt der Fehler, den Vorgang, der hierher geführt hat, mit dem
              Fehlercode ALG-00 melden.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <a href="/" className="btn-ghost text-xs">Zur Startseite</a>
          <button className="btn-primary" onClick={reset}>Erneut versuchen</button>
        </div>
      </div>
    </main>
  );
}
