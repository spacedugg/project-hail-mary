import Link from "next/link";

/**
 * OS-Shell: das übergeordnete Rahmen-Interface (Betriebssystem-Gedanke).
 * Seitenleiste = Account-Bereiche aus der Informationsarchitektur (D23).
 * Bereiche ohne fertiges Modul zeigen ehrlich ihren Bau-Status.
 */

const NAV = [
  { href: "/", label: "Cockpit", icon: "◧" },
  { href: "/katalog", label: "Katalog", icon: "▤" },
  { href: "/sichtbarkeit", label: "Sichtbarkeit & Markt", icon: "◔" },
  { href: "/advertising", label: "Advertising / PPC", icon: "◎" },
  { href: "/berichte", label: "Berichte & Daten", icon: "⇪" },
  { href: "/handlungen", label: "Handlungen", icon: "☰" },
];

function DemoBanner() {
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

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-none border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 sm:block">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-teal-600 to-teal-900" />
          <div>
            <div className="text-sm font-semibold leading-tight">temoa OS</div>
            <div className="text-[10px] text-neutral-500">Amazon-Betriebssystem · intern</div>
          </div>
        </div>
        <nav className="p-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              <span className="w-4 text-center text-neutral-400">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mx-4 mt-4 border-t border-neutral-200 pt-3 text-[10px] leading-relaxed text-neutral-400 dark:border-neutral-800">
          v0 · Text-Content-Scheibe aktiv.<br />
          Weitere Bereiche im Aufbau — Status je Seite.
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <div className="flex-1">{children}</div>
      </div>
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
