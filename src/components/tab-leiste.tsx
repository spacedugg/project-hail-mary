"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Reiter-Leiste mit SOFORT-Feedback (D173, Nutzer-Vorgabe 22.07.): Der Klick
 * markiert den Ziel-Reiter optimistisch im selben Moment, ein Spinner am
 * Reiter + eine laufende Fortschritts-Linie zeigen das Laden — nie wieder
 * 3 Sekunden ohne Rückmeldung.
 */
export function TabLeiste({
  basisHref,
  tabs,
  aktiv,
  extra = [],
}: {
  basisHref: string;
  tabs: Array<{ key: string; label: string }>;
  aktiv: string;
  extra?: Array<{ href: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ziel, setZiel] = useState<string | null>(null);
  useEffect(() => {
    if (!pending) setZiel(null);
  }, [pending]);

  const anzeige = pending && ziel && tabs.some((t) => t.key === ziel) ? ziel : aktiv;
  const wechsel = (key: string) => {
    if (key === anzeige) return;
    setZiel(key);
    startTransition(() => router.push(`${basisHref}?tab=${key}`, { scroll: false }));
  };

  return (
    <div className="relative mt-4">
      <nav className="flex flex-wrap gap-1 border-b border-hair">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => wechsel(t.key)}
            className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm transition ${anzeige === t.key ? "border-b-2 border-[var(--primary)] font-semibold text-primary-strong" : "text-muted hover:text-foreground"}`}
          >
            {t.label}
            {pending && ziel === t.key && <span className="spinner h-3 w-3" aria-label="Lädt" />}
          </button>
        ))}
        {extra.map((e) => (
          <button
            key={e.href}
            type="button"
            onClick={() => {
              setZiel(e.href);
              startTransition(() => router.push(e.href));
            }}
            className="flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm text-muted transition hover:text-foreground"
          >
            {e.label}
            {pending && ziel === e.href && <span className="spinner h-3 w-3" aria-label="Lädt" />}
          </button>
        ))}
      </nav>
      {pending && <span className="nav-progress" aria-hidden />}
    </div>
  );
}
