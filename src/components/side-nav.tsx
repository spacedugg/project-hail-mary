"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sidebar-Navigation (Client, nur für den Aktiv-Zustand via Pfad).
 * Icons kommen als ReactNode vom Server — hier nur Markup + active-Logik.
 */
export function SideNav({ items }: { items: Array<{ href: string; label: string; icon: React.ReactNode; exact?: boolean; alsoMatch?: string }> }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 px-2 pb-2">
      {items.map((n) => {
        const active =
          (n.exact ? pathname === n.href : pathname.startsWith(n.href)) ||
          (n.alsoMatch ? pathname.startsWith(n.alsoMatch) : false);
        return (
          <Link key={n.href} href={n.href} className={`side-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className={`flex w-5 justify-center ${active ? "" : "text-muted"}`}>{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
