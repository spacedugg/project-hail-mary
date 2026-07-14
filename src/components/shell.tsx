import Link from "next/link";
import { getSessionUser, hasRealAuthSecret } from "@/lib/auth/session";
import { logout } from "@/app/auth-actions";
import { SideNav } from "@/components/side-nav";
import {
  IconCockpit,
  IconKatalog,
  IconSichtbarkeit,
  IconAds,
  IconBerichte,
  IconFlatfile,
  IconHandlungen,
  IconSettings,
  IconLogout,
  IconSparkle,
} from "@/components/icons";

/**
 * Zwei Navigations-Ebenen (D23/D45):
 * - Agentur-Ebene: Portfolio (OsShell — schlanke Sidebar)
 * - Marken-Workspace: BrandShell mit den 7 Bereichen, alles markengefiltert
 * Unten in jeder Sidebar: Profil + Einstellungen + Abmelden (D57).
 */

export function DemoBanner() {
  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY (Text-KI)");
  if (!process.env.APIFY_API_KEY) missing.push("APIFY_API_KEY (Reviews)");
  if (!hasRealAuthSecret()) missing.push("AUTH_SECRET (Login-Signatur)");
  if (missing.length === 0) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <b>⚠️ Demo-Modus:</b> {missing.join(" und ")} nicht hinterlegt — generierte Inhalte sind ggf.
      <b> Platzhalter</b> und Logins nur dev-signiert. Keys in Vercel unter Settings → Environment Variables setzen, dann Redeploy.
    </div>
  );
}

/** Profil-Bereich unten in der Sidebar: Avatar, Name, Einstellungen, Abmelden. */
async function ProfileFooter() {
  const user = await getSessionUser();
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="mt-auto border-t border-hair p-2.5">
      <div className="flex items-center gap-2.5 rounded-xl p-1.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] text-[11px] font-semibold text-white shadow-[0_4px_10px_rgb(124_92_252/0.35)]">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-tight">{user.name}</div>
          <div className="truncate text-[10px] text-muted">{user.email}</div>
        </div>
        <Link href="/einstellungen" title="Einstellungen" className="rounded-lg p-1.5 text-muted transition hover:bg-primary-soft hover:text-primary-strong">
          <IconSettings className="h-4 w-4" />
        </Link>
        <form action={logout}>
          <button title="Abmelden" className="rounded-lg p-1.5 text-muted transition hover:bg-[rgb(220_38_38/0.08)] hover:text-bad">
            <IconLogout className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

const BRAND_NAV = (brandId: string) => [
  { href: `/marke/${brandId}`, label: "Cockpit", icon: <IconCockpit />, exact: true },
  { href: `/marke/${brandId}/katalog`, label: "Katalog", icon: <IconKatalog /> },
  { href: `/marke/${brandId}/sichtbarkeit`, label: "Sichtbarkeit & Markt", icon: <IconSichtbarkeit /> },
  { href: `/marke/${brandId}/advertising`, label: "Advertising / PPC", icon: <IconAds /> },
  { href: `/marke/${brandId}/berichte`, label: "Berichte & Daten", icon: <IconBerichte /> },
  { href: `/marke/${brandId}/flatfiles`, label: "Flat Files", icon: <IconFlatfile /> },
  { href: `/marke/${brandId}/handlungen`, label: "Handlungen", icon: <IconHandlungen /> },
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
      <aside className="card hidden w-60 flex-none flex-col self-start sm:sticky sm:top-2 sm:flex sm:max-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-1rem)]">
        <div className="px-4 pb-3 pt-4">
          <Link href="/" className="text-[10px] uppercase tracking-wide text-muted transition hover:text-primary-strong">← Portfolio · temoa OS</Link>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="inline-block h-8 w-8 flex-none rounded-xl bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] shadow-[0_4px_12px_rgb(124_92_252/0.35)]" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{brand.name}</div>
              <div className="truncate text-[10px] text-muted">Kunde: {brand.clientName}</div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideNav items={BRAND_NAV(brand.id)} />
          {allBrands.length > 1 && (
            <div className="mx-3 mb-3 mt-1 border-t border-hair px-1 pt-3">
              <div className="px-1 text-[10px] uppercase tracking-wide text-muted">Marke wechseln</div>
              <div className="mt-1 space-y-0.5">
                {allBrands.filter((b) => b.id !== brand.id).slice(0, 8).map((b) => (
                  <Link key={b.id} href={`/marke/${b.id}`} className="block truncate rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-primary-soft hover:text-foreground">
                    {b.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        <ProfileFooter />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Agentur-Ebene (Portfolio, Einstellungen): schlanke OS-Sidebar mit Profil unten. */
export function OsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen gap-2 p-2">
      <aside className="card hidden w-60 flex-none flex-col self-start sm:sticky sm:top-2 sm:flex sm:max-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-1rem)]">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] text-white shadow-[0_4px_12px_rgb(124_92_252/0.35)]">
            <IconSparkle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">temoa OS</div>
            <div className="text-[10px] text-muted">Wachstum & Profitabilität</div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideNav
            items={[
              { href: "/", label: "Portfolio", icon: <IconCockpit />, exact: true },
              { href: "/einstellungen", label: "Einstellungen", icon: <IconSettings /> },
            ]}
          />
        </div>
        <ProfileFooter />
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
        <h1 className="page-title">{title}</h1>
        <span className="pill pill-warn">im Aufbau</span>
      </div>
      <p className="page-sub">{purpose}</p>
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
