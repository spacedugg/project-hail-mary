import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { seedDemoDataAction, wipeAllDataAction } from "@/app/actions";
import Link from "next/link";
import { OsShell } from "@/components/shell";
import { IconUsers, IconSearch, IconArrowRight } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Tool-Einstellungen (D57/D86) — alles, was für ALLE gilt: Daten & Formeln,
 * Team, Demo & Zurücksetzen. Persönliches (Name, Passwort) liegt getrennt
 * unter „Mein Konto" (Zahnrad neben dem Namen in der Sidebar).
 */
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
      <main className="w-full p-8">
        <h1 className="page-title">Tool-Einstellungen</h1>
        <p className="page-sub">Gilt für das ganze Tool und alle im Team. Persönliches (Name, Passwort) findest du unter „Mein Konto" — das Zahnrad neben deinem Namen.</p>

        {fehler && <p className="mt-4 rounded-xl bg-[rgb(220_38_38/0.08)] px-3 py-2 text-sm text-bad">{fehler}</p>}
        {ok && <p className="mt-4 rounded-xl bg-[rgb(22_163_74/0.08)] px-3 py-2 text-sm text-good">✓ {ok}</p>}

        <div className="stagger mt-6 space-y-4">
          <Link href="/rechenwerk" className="card group flex items-center gap-3 p-5">
            <span className="icon-chip chip-violet"><IconSearch /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Daten & Formeln — was wir ziehen, wie das Tool rechnet</div>
              <div className="text-xs text-muted">Berichte-Register (welche Berichte, welche Kennzahlen daraus), alle KPI-Formeln mit Quelle, Content-Regeln, Gebühren-Tabellen (live & austauschbar).</div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong transition group-hover:gap-2">öffnen <IconArrowRight className="h-3.5 w-3.5" /></span>
          </Link>

          <section className="card p-5">
            <h2 className="sect-h">Demo & Zurücksetzen</h2>
            <p className="mt-1 text-xs text-muted">
              Legt die Demo-Marke „AquaVita" mit 3 Produkten und Monatsdaten ab 01.01.2026 an (Business/Ads Jan–Jun, Search-Term, SQP,
              SOV-Audit, Keywords, Content, Margen-Kalkulation) — alles durch die echten Parser erzeugt. Der Wipe löscht ALLE Marken,
              Produkte und Berichte; Konten und Rechenwerk bleiben.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <form action={seedDemoDataAction}>
                <SubmitButton className="btn-primary text-xs" pendingLabel="Legt Demo-Daten an…" progress>Demo-Marke anlegen (Jahr 2026)</SubmitButton>
              </form>
              <form action={wipeAllDataAction} className="flex items-center gap-2">
                <input name="confirm" placeholder="Zum Bestätigen: LÖSCHEN" className={`${input} w-52 text-xs`} />
                <SubmitButton className="btn-ghost text-xs !text-bad">Alle Marken & Daten löschen</SubmitButton>
              </form>
            </div>
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
