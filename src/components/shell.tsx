import Link from "next/link";

/**
 * Zwei Navigations-Ebenen (D23/D45):
 * - Agentur-Ebene: Portfolio (Einstieg, ohne Marken-Sidebar)
 * - Marken-Workspace: Sidebar mit den 6 Bereichen, alles auf die Marke gefiltert
 */

export function DemoBanner() {
  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY (Text-KI)");
  if (!process.env.APIFY_API_KEY) missing.push("APIFY_API_KEY (Reviews)");
  if (missing.length === 0) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <b>⚠️ Demo-Modus:</b> {missing.join(" und ")} nicht hinterlegt — generierte Inhalte sind
      <b> Platzhalter-Templates, keine echten KI-Texte</b>. Keys in Vercel unter Settings → Environment Variables setzen, dann Redeploy.
    </div>
  );
}

const BRAND_NAV = [
  { path: "", label: "Cockpit", icon: "◧" },
  { path: "/katalog", label: "Katalog", icon: "▤" },
  { path: "/sichtbarkeit", label: "Sichtbarkeit & Markt", icon: "◔" },
  { path: "/advertising", label: "Advertising / PPC", icon: "◎" },
  { path: "/berichte", label: "Berichte & Daten", icon: "⇪" },
  { path: "/handlungen", label: "Handlungen", icon: "☰" },
];

export function BrandShell({
  brand,
  allBrands,
  children,
}: {
  brand: { id: string; name: string; clientName: string };
  allBrands: Array<{ id: string; name: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-none border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 sm:block">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Link href="/" className="text-[10px] uppercase tracking-wide text-neutral-400 hover:text-teal-700">← Portfolio · temoa OS</Link>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block h-6 w-6 flex-none rounded-md bg-gradient-to-br from-teal-600 to-teal-900" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{brand.name}</div>
              <div className="truncate text-[10px] text-neutral-500">Kunde: {brand.clientName}</div>
            </div>
          </div>
        </div>
        <nav className="p-2">
          {BRAND_NAV.map((n) => (
            <Link
              key={n.path}
              href={`/marke/${brand.id}${n.path}`}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              <span className="w-4 text-center text-neutral-400">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        {allBrands.length > 1 && (
          <div className="mx-2 mt-3 border-t border-neutral-200 px-2 pt-3 dark:border-neutral-800">
            <div className="px-1 text-[10px] uppercase tracking-wide text-neutral-400">Marke wechseln</div>
            <div className="mt-1 space-y-0.5">
              {allBrands.filter((b) => b.id !== brand.id).slice(0, 8).map((b) => (
                <Link key={b.id} href={`/marke/${b.id}`} className="block truncate rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-900">
                  {b.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Einheitliche Platzhalter-Seite für Bereiche im Aufbau — ehrlich statt leer. */
export function AreaStub({
  title,
  purpose,
  planned,
  feeds,
}: {
  title: string;
  purpose: string;
  planned: string[];
  feeds: string;
}) {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <span className="rounded-full border border-amber-400 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          im Aufbau
        </span>
      </div>
      <p className="mt-2 max-w-xl text-sm text-neutral-600 dark:text-neutral-400">{purpose}</p>
      <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Geplante Elemente</h2>
        <ul className="mt-2 space-y-1">
          {planned.map((p, i) => (
            <li key={i} className="text-sm text-neutral-700 dark:text-neutral-300">· {p}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">Datenbasis: {feeds}</p>
      </div>
    </main>
  );
}
