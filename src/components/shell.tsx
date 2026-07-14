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
  { path: "/flatfiles", label: "Flat Files", icon: "⇣" },
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
    <div className="flex min-h-screen gap-2 p-2">
      <aside className="card hidden w-60 flex-none self-start sm:sticky sm:top-2 sm:block">
        <div className="px-4 pb-3 pt-4">
          <Link href="/" className="text-[10px] uppercase tracking-wide text-muted hover:text-primary-strong">← Portfolio · temoa OS</Link>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="inline-block h-8 w-8 flex-none rounded-xl bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] shadow-[0_4px_12px_rgb(124_92_252/0.35)]" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{brand.name}</div>
              <div className="truncate text-[10px] text-muted">Kunde: {brand.clientName}</div>
            </div>
          </div>
        </div>
        <nav className="space-y-0.5 px-2 pb-2">
          {BRAND_NAV.map((n) => (
            <Link key={n.path} href={`/marke/${brand.id}${n.path}`} className="side-item">
              <span className="w-4 text-center text-muted">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        {allBrands.length > 1 && (
          <div className="mx-3 mb-3 mt-1 border-t border-hair px-1 pt-3">
            <div className="px-1 text-[10px] uppercase tracking-wide text-muted">Marke wechseln</div>
            <div className="mt-1 space-y-0.5">
              {allBrands.filter((b) => b.id !== brand.id).slice(0, 8).map((b) => (
                <Link key={b.id} href={`/marke/${b.id}`} className="block truncate rounded-lg px-2 py-1 text-xs text-muted hover:bg-primary-soft hover:text-foreground">
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
        <span className="pill pill-warn">
          im Aufbau
        </span>
      </div>
      <p className="mt-2 max-w-xl text-sm text-neutral-600 dark:text-neutral-400">{purpose}</p>
      <div className="mt-6 card p-4">
        <h2 className="sect-h">Geplante Elemente</h2>
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
