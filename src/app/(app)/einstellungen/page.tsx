import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { updateProfile, changePassword } from "@/app/auth-actions";
import Link from "next/link";
import { OsShell } from "@/components/shell";
import { IconUsers, IconSearch, IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Einstellungen (D57): eigenes Profil + Passwort; Team-Übersicht. */
export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; ok?: string }>;
}) {
  const { fehler, ok } = await searchParams;
  const session = (await getSessionUser())!;
  const db = await getDb();
  const team = await db.query.users.findMany();
  const input = "input-base";

  return (
    <OsShell>
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="page-title">Einstellungen</h1>
        <p className="page-sub">Dein Profil und das Agentur-Team. Rollen & Rechte folgen mit der Kunden-Freischaltung.</p>

        {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad">{fehler}</p>}
        {ok && <p className="mt-4 rounded-xl bg-[rgb(22_163_74/0.08)] px-3 py-2 text-sm text-good">✓ {ok}</p>}

        <div className="stagger mt-6 space-y-4">
          <Link href="/rechenwerk" className="card group flex items-center gap-3 p-5">
            <span className="icon-chip chip-violet"><IconSearch /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Rechenwerk — wie das Tool rechnet</div>
              <div className="text-xs text-muted">Alle KPI-Formeln mit Quelle, Content-Regeln, Amazon-Gebühren-Tabellen (live & austauschbar). Anti-Blackbox.</div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong transition group-hover:gap-2">öffnen <IconArrowRight className="h-3.5 w-3.5" /></span>
          </Link>

          <section className="card p-5">
            <h2 className="sect-h">Profil</h2>
            <form action={updateProfile} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">Name</span>
                <input name="name" defaultValue={session.name} required className={input} />
              </label>
              <div className="min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">E-Mail (fest)</span>
                <div className={`${input} cursor-not-allowed bg-background text-muted`}>{session.email}</div>
              </div>
              <button className="btn-dark">Speichern</button>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="sect-h">Passwort ändern</h2>
            <form action={changePassword} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">Aktuelles Passwort</span>
                <input name="current" type="password" required autoComplete="current-password" className={input} />
              </label>
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">Neues Passwort (min. 8 Zeichen)</span>
                <input name="next" type="password" required minLength={8} autoComplete="new-password" className={input} />
              </label>
              <button className="btn-dark">Ändern</button>
            </form>
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2.5">
              <span className="icon-chip chip-violet"><IconUsers /></span>
              <h2 className="text-sm font-semibold">Agentur-Team · {team.length}</h2>
            </div>
            <ul className="mt-3 divide-y divide-hair">
              {team.map((u) => (
                <li key={u.id} className="flex items-center gap-2.5 py-2">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] text-[10px] font-semibold text-white">
                    {u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.name}{u.id === session.id && <span className="ml-1 text-xs text-muted">(du)</span>}</div>
                    <div className="truncate text-xs text-muted">{u.email}</div>
                  </div>
                  <span className="tag uppercase">{u.role}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Neue Team-Mitglieder legen ihr Konto selbst über die Anmelde-Seite an („Konto anlegen").</p>
          </section>
        </div>
      </main>
    </OsShell>
  );
}
