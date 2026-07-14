import Link from "next/link";
import { redirect } from "next/navigation";
import { login, register } from "@/app/auth-actions";
import { getSessionUser } from "@/lib/auth/session";
import { IconSparkle, IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Anmeldung/Registrierung (D57) — agentur-intern, jeder mit eigenem Konto. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; tab?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { fehler, tab } = await searchParams;
  const isRegister = tab === "neu";
  const input = "input-base";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Bühne: weicher Violett-Verlauf mit Lichtflecken */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_20%_10%,rgb(124_92_252/0.18),transparent),radial-gradient(50%_40%_at_85%_85%,rgb(47_158_143/0.14),transparent)]" />

      <div className="anim-in w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8f6dff] to-[#5b3fd4] text-white shadow-[0_8px_24px_rgb(124_92_252/0.45)]">
            <IconSparkle className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xl font-semibold leading-tight tracking-tight">temoa OS</div>
            <div className="text-[11px] text-muted">Cockpit für Wachstum & Profitabilität</div>
          </div>
        </div>

        <div className="card p-6 sm:p-8">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-background p-1 text-center text-sm font-medium">
            <Link href="/login" className={`rounded-full py-1.5 transition ${!isRegister ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}>
              Anmelden
            </Link>
            <Link href="/login?tab=neu" className={`rounded-full py-1.5 transition ${isRegister ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}>
              Konto anlegen
            </Link>
          </div>

          {fehler && <p className="mb-4 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad">{fehler}</p>}

          {isRegister ? (
            <form action={register} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Name</span>
                <input name="name" required autoComplete="name" placeholder="Vor- und Nachname" className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">E-Mail</span>
                <input name="email" type="email" required autoComplete="email" placeholder="name@temoa.de" className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Passwort (min. 8 Zeichen)</span>
                <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
              </label>
              <button className="btn-primary w-full justify-center py-2.5">
                Konto anlegen <IconArrowRight className="h-4 w-4" />
              </button>
              <p className="text-center text-[11px] text-muted">Agentur-intern · erstes Konto wird Admin</p>
            </form>
          ) : (
            <form action={login} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">E-Mail</span>
                <input name="email" type="email" required autoComplete="email" placeholder="name@temoa.de" className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Passwort</span>
                <input name="password" type="password" required autoComplete="current-password" className={input} />
              </label>
              <button className="btn-primary w-full justify-center py-2.5">
                Anmelden <IconArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted">temoa · internes Betriebssystem</p>
      </div>
    </main>
  );
}
