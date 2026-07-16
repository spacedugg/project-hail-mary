import { getSessionUser } from "@/lib/auth/session";
import { updateProfile, changePassword } from "@/app/auth-actions";
import { OsShell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Mein Konto (D86) — die PERSÖNLICHEN Einstellungen (Zahnrad neben dem Namen):
 * eigener Name, Passwort. Tool-weite Einstellungen (Team, Demo, Daten & Formeln)
 * liegen getrennt unter „Tool-Einstellungen" in der Sidebar.
 */
export default async function KontoPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; ok?: string }>;
}) {
  const { fehler, ok } = await searchParams;
  const session = (await getSessionUser())!;
  const input = "input-base";

  return (
    <OsShell>
      <main className="w-full p-8">
        <h1 className="page-title">Mein Konto</h1>
        <p className="page-sub">Deine persönlichen Einstellungen — nur für dich. Tool-weite Einstellungen findest du unten in der Sidebar.</p>

        {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad">{fehler}</p>}
        {ok && <p className="mt-4 rounded-xl bg-[rgb(22_163_74/0.08)] px-3 py-2 text-sm text-good">✓ {ok}</p>}

        <div className="stagger mt-6 space-y-4">
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
              <SubmitButton className="btn-dark">Speichern</SubmitButton>
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
              <SubmitButton className="btn-dark">Ändern</SubmitButton>
            </form>
          </section>
        </div>
      </main>
    </OsShell>
  );
}
