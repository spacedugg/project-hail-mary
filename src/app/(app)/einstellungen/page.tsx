import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { seedDemoDataAction, wipeAllDataAction } from "@/app/actions";
import Link from "next/link";
import { OsShell } from "@/components/shell";
import { IconUsers, IconSearch, IconArrowRight } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";
import { regelAendern, regelZuruecksetzen, regelaenderungenSuchen, vorschlagVerwerfen } from "@/app/regel-actions";
import { ladeRegelUebersicht, ladeRegelHistorie, ladeWaechterStand } from "@/lib/validation/regelstand-db";

export const dynamic = "force-dynamic";

/**
 * Tool-Einstellungen (D57/D86) — alles, was für ALLE gilt: Daten & Formeln,
 * Team, Demo & Zurücksetzen. Persönliches (Name, Passwort) liegt getrennt
 * unter „Mein Konto" (Zahnrad neben dem Namen in der Sidebar).
 */
export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; code?: string; ok?: string; hinweis?: string }>;
}) {
  const { fehler, code, ok, hinweis } = await searchParams;
  const session = (await getSessionUser())!;
  const db = await getDb();
  const team = await db.query.users.findMany();
  const regeln = await ladeRegelUebersicht();
  const regelHistorie = await ladeRegelHistorie();
  const waechter = await ladeWaechterStand();
  const input = "input-base";

  return (
    <OsShell>
      <main className="w-full p-8">
        <h1 className="page-title">Tool-Einstellungen</h1>
        <p className="page-sub">Gilt für das ganze Tool und alle im Team. Persönliches (Name, Passwort) findest du unter „Mein Konto" — das Zahnrad neben deinem Namen.</p>

        {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}
        {ok && <p className="mt-4 rounded-xl bg-[rgb(22_163_74/0.08)] px-3 py-2 text-sm text-good">✓ {ok}</p>}
        {hinweis && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm text-primary-strong">ℹ {hinweis}</p>}

        <div className="stagger mt-6 space-y-4">
          {/* ── Amazon-Regelstand (Regel-Wächter) ──────────────────────── */}
          <section className="card p-5">
            <h2 className="sect-h">Amazon-Regelstand</h2>
            <p className="mt-1 text-xs text-muted">
              Ändert Amazon eine Vorgabe — etwa die zulässige Titellänge —, wird sie hier eingetragen. Das Tool prüft
              danach <b>sofort jeden bereits freigegebenen Text aller Marken</b> und legt für jede betroffene Stelle
              einen Alert an. Neue Generierungen rechnen ab dann mit dem neuen Wert.
            </p>

            {/* Regel-Wächter: das Tool sucht selbst, der Mensch entscheidet. */}
            <div className="mt-4 rounded-xl border border-hair p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Nach Amazon-Änderungen suchen</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Das Tool durchsucht Amazon-Quellen nach neuen Vorgaben und legt <b>Vorschläge</b> ab.
                    Übernommen wird nichts von selbst — eine Websuche kann sich irren, und eine still geänderte
                    Grenze würde bei allen Kunden Alerts auf einer Falschmeldung erzeugen.
                  </p>
                </div>
                <form action={regelaenderungenSuchen}>
                  <SubmitButton className="btn-primary text-xs" pendingLabel="Sucht … (bis zu 2 Min.)" progress>
                    Jetzt nachsehen
                  </SubmitButton>
                </form>
              </div>

              {waechter && (
                <p className="mt-2 text-[11px] text-muted">
                  Zuletzt geprüft: {new Date(waechter.gepruefaAm).toLocaleString("de-DE")}
                </p>
              )}

              {waechter && waechter.funde.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {waechter.funde.map((f) => (
                    <li key={f.key} className="rounded-lg border border-hair p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <b>{f.label}</b>
                        <span className="tabular-nums">{f.aktuell} → {f.vorgeschlagen} {f.einheit}</span>
                        <span className={f.sicherheit === "hoch" ? "pill pill-good" : f.sicherheit === "mittel" ? "pill pill-warn" : "pill pill-bad"}>
                          Sicherheit {f.sicherheit}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">&bdquo;{f.zitat}&ldquo;</p>
                      <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-[11px] text-primary-strong underline">
                        {f.quelle} — {f.url}
                      </a>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <form action={regelAendern} className="flex items-center gap-2">
                          <input type="hidden" name="key" value={f.key} />
                          <input type="hidden" name="wert" value={f.vorgeschlagen} />
                          <input type="hidden" name="quelle" value={`${f.quelle} — ${f.url}`} />
                          <SubmitButton className="btn-dark text-[11px]" pendingLabel="Prüft alle Marken …">Übernehmen</SubmitButton>
                        </form>
                        <form action={vorschlagVerwerfen}>
                          <input type="hidden" name="key" value={f.key} />
                          <SubmitButton className="btn-ghost text-[11px]">Verwerfen</SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {waechter && waechter.funde.length === 0 && (
                <p className="mt-2 text-xs text-good">Keine belegte Änderung offen.</p>
              )}

              {waechter && (waechter.hinweise.length > 0 || waechter.verworfen.length > 0) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-muted">
                    Was die Suche sonst gesehen hat ({waechter.hinweise.length + waechter.verworfen.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {waechter.hinweise.map((h, i) => (
                      <li key={`h${i}`} className="text-[11px] text-muted">· {h}</li>
                    ))}
                    {waechter.verworfen.map((v, i) => (
                      <li key={`v${i}`} className="text-[11px] text-warn">· verworfen: {v}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Regel</th>
                    <th className="py-2 pr-3">Wirksam</th>
                    <th className="py-2 pr-3">Auslieferung</th>
                    <th className="py-2 pr-3">Neuer Wert</th>
                    <th className="py-2 pr-3">Quelle</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {regeln.map((r) => (
                    <tr key={r.key} className="border-b border-hair/60 align-middle">
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        <b>{r.wirksam}</b> <span className="text-[11px] text-muted">{r.einheit}</span>
                        {r.geaendert && <span className="ml-1 pill pill-warn">geändert</span>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted">{r.standard}</td>
                      <td className="py-2 pr-3" colSpan={3}>
                        <form action={regelAendern} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="key" value={r.key} />
                          <input name="wert" type="number" min={1} defaultValue={r.wirksam} className="input-base w-24 text-sm" />
                          <input name="quelle" placeholder="Quelle, z. B. Amazon-Ankündigung 07/2026" required className="input-base min-w-56 flex-1 text-sm" />
                          <SubmitButton className="btn-dark text-xs" pendingLabel="Prüft alle Marken …">Übernehmen</SubmitButton>
                          {r.geaendert && (
                            <SubmitButton formAction={regelZuruecksetzen} className="btn-ghost text-xs">zurücksetzen</SubmitButton>
                          )}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold">
                Änderungs-Protokoll <span className="font-normal text-muted">({regelHistorie.length})</span>
              </summary>
              {regelHistorie.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Noch keine Regeländerung — es gilt überall der Auslieferungsstand.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {regelHistorie.map((h, i) => (
                    <li key={i} className="border-b border-hair/60 pb-1 text-xs">
                      <b>{h.label}</b>: {h.alt} → {h.neu}{" "}
                      <span className="text-muted">
                        · {h.quelle} · {new Date(h.gueltigAb).toLocaleDateString("de-DE")}
                        {h.erfasstVon ? ` · ${h.erfasstVon}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>

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
