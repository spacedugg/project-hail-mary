"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Untermenü der markenweiten Content-Verwaltung.
 *
 * Bewusst OHNE produktbezogene Inhalte (Nutzer-Entscheidung 22.07.): Alles,
 * was ein einzelnes Produkt betrifft, lebt im Produkt. Hier stehen nur Dinge,
 * die über ALLE Produkte einer Marke laufen.
 */
export function PublishNav({
  brandId,
  offeneFreigaben,
  offeneAlerts,
  offenesFeedback,
}: {
  brandId: string;
  offeneFreigaben: number;
  offeneAlerts: number;
  offenesFeedback: number;
}) {
  const pathname = usePathname();
  const basis = `/marke/${brandId}/publish`;
  // Reihenfolge = der Lebenszyklus (D236, Nutzer-Wunsch): Auf die Dashboard-
  // Übersicht (Freigaben) folgt der Kunden-Schritt, dann die Überwachung des
  // Live-Stands, zuletzt „Push" (früher „Sammel-Export") — die Übertragung
  // nach Amazon, manuell oder per API.
  const items = [
    { href: basis, label: "Freigaben", exact: true, zahl: offeneFreigaben },
    { href: `${basis}/feedback`, label: "Kunden-Feedback", exact: false, zahl: offenesFeedback },
    { href: `${basis}/alerts`, label: "Überwachung", exact: false, zahl: offeneAlerts },
    { href: `${basis}/dateien`, label: "Push", exact: false, zahl: 0 },
  ];
  return (
    <nav className="mt-4 flex flex-wrap gap-1.5 print:hidden">
      {items.map((i) => {
        const aktiv = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={aktiv ? "page" : undefined}
            className={
              aktiv
                ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-hair px-3.5 py-1.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary-strong"
            }
          >
            {i.label}
            {i.zahl > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${aktiv ? "bg-white/25" : "bg-primary-soft text-primary-strong"}`}>
                {i.zahl}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
