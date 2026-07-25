"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Reiter-Band des Produkt-Arbeitsplatzes.
 *
 * Grund (Nutzer-Befund 22.07.): Wer im Produkt arbeitet, soll im Produkt
 * bleiben. Vorher führte „Content-Verwaltung" in der Seitenleiste eine Ebene
 * höher auf die Marke — der Produkt-Kontext ging verloren. Die Marken-Sicht
 * bleibt bestehen (sie beantwortet Fragen über ALLE Produkte hinweg), aber
 * für ein einzelnes Produkt gibt es sie jetzt auch hier.
 */
export function ProduktNav({ productId, feedbackOffen = 0 }: { productId: string; feedbackOffen?: number }) {
  const pathname = usePathname();
  const basis = `/produkte/${productId}`;
  const items = [
    { href: basis, label: "Werkstatt", exact: true, zahl: 0 },
    // Content-Verwaltung, NICHT „Publish": Publishen ist einer von vier
    // Schritten des Lebenszyklus (erstellen → speichern → publishen →
    // überwachen). Der Reiter trägt alle vier für DIESES Produkt.
    { href: `${basis}/content`, label: "Content-Verwaltung", exact: false, zahl: feedbackOffen },
    { href: `${basis}/analyse`, label: "Analyse", exact: false, zahl: 0 },
    { href: `${basis}/reviews`, label: "Bewertungen", exact: false, zahl: 0 },
    { href: `${basis}/briefs`, label: "Creative-Briefs", exact: false, zahl: 0 },
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
