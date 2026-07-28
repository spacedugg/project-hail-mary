"use client";

import { useState } from "react";
import { propagiereChild, auditFamilieKonsistenz } from "@/app/actions";
import {
  TREE_PIECES,
  TREE_PIECE_LABEL,
  PROPAGIERTE_PIECES,
  type FamilienDaten,
  type FamilienKind,
  type TreePiece,
} from "@/lib/variants/laden";
import type { FamilieAuditKind } from "@/lib/variants/masterActions";
import type { ValidationIssue } from "@/db/schema";

/**
 * Familien-Baum (D236, Nutzer-Wunsch): freigegebene Base-ASIN oben, Geschwister
 * darunter aufgefächert und per Linie verbunden. „Auf Geschwister übertragen"
 * läuft Kind für Kind LIVE — je Kind füllen sich Titel → Bullets → Beschreibung
 * gestaffelt grün. Ideal für Kunden-Demos (Screenshare): man sieht, wie in
 * Sekunden aus einer ASIN der Content auf viele Varianten übertragen wird.
 *
 * Green = Content vorhanden/übertragen · Sanduhr = wird gerade erzeugt ·
 * graues Minus = nicht angelegt (bzw. nicht Teil des Masters).
 */

const CHILD_W = 190; // px — feste Kachelbreite, damit die Verbindungslinien passen
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type KindLauf = {
  status: "idle" | "running" | "done";
  gruen: Set<TreePiece>;
  passed?: boolean;
  issues?: ValidationIssue[];
};

function initGruen(k: FamilienKind): Set<TreePiece> {
  return new Set(TREE_PIECES.filter((p) => k.pieces[p] !== "none"));
}

function PieceZeile({ label, zustand }: { label: string; zustand: "gruen" | "pending" | "leer" }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px]">
      {zustand === "gruen" ? (
        <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-[rgb(22_163_74/0.15)] text-[10px] text-good">✓</span>
      ) : zustand === "pending" ? (
        <span className="grid h-4 w-4 flex-none animate-pulse place-items-center rounded-full bg-amber-100 text-[9px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⏳</span>
      ) : (
        <span className="grid h-4 w-4 flex-none place-items-center rounded-full border border-hair text-[10px] text-muted">–</span>
      )}
      <span className={zustand === "leer" ? "text-muted" : ""}>{label}</span>
    </li>
  );
}

function Kachel({
  kind,
  zustand,
  badge,
}: {
  kind: FamilienKind;
  zustand: (p: TreePiece) => "gruen" | "pending" | "leer";
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-hair bg-[var(--surface)] p-2.5 shadow-sm" style={{ width: CHILD_W }}>
      <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-hair bg-white">
        {kind.bildUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={kind.bildUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[10px] text-muted">kein Bild</span>
        )}
      </div>
      <div className="mt-1.5 truncate font-mono text-[12px] font-bold" title={kind.asin ?? undefined}>{kind.asin ?? "—"}</div>
      {kind.titel && kind.titel !== kind.asin && (
        <div className="truncate text-[10px] text-muted" title={kind.titel}>{kind.titel}</div>
      )}
      <ul className="mt-1.5 space-y-1">
        {TREE_PIECES.map((p) => (
          <PieceZeile key={p} label={TREE_PIECE_LABEL[p]} zustand={zustand(p)} />
        ))}
      </ul>
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  );
}

export function FamilieBaum({ familie }: { familie: FamilienDaten }) {
  const baseAsin = familie.master?.baseChildAsin ?? null;
  const base =
    familie.kinder.find((k) => (k.asin ?? k.id) === baseAsin) ??
    familie.kinder.find((k) => k.hatFreigegebenenContent) ??
    null;
  const targets = familie.kinder.filter((k) => k !== base);

  const [lauf, setLauf] = useState<Record<string, KindLauf>>(() =>
    Object.fromEntries(targets.map((t) => [t.id, { status: "idle", gruen: initGruen(t) } as KindLauf])),
  );
  const [running, setRunning] = useState(false);
  const [mockWarn, setMockWarn] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pruefBusy, setPruefBusy] = useState(false);
  const [audit, setAudit] = useState<FamilieAuditKind[] | null>(null);

  const setKind = (id: string, patch: Partial<KindLauf>) =>
    setLauf((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  async function uebertragen() {
    setRunning(true);
    setFehler(null);
    setMockWarn(false);
    setAudit(null);
    for (const t of targets) {
      setKind(t.id, { status: "running" });
      const res = await propagiereChild(familie.parentId, t.id);
      if (!res.ok) {
        setFehler(res.fehler);
        setKind(t.id, { status: "idle" });
        continue;
      }
      if (res.mock) setMockWarn(true);
      // Achsen-fehlt = nichts persistiert → keine grünen Häkchen setzen.
      const persistiert = !res.kind.issues.some((i) => i.rule === "familie.achsenwert-fehlt");
      if (persistiert) {
        for (const p of PROPAGIERTE_PIECES) {
          await sleep(260); // gestaffelt für den Live-Effekt (Content ist bereits gespeichert)
          setLauf((prev) => {
            const s = prev[t.id];
            const g = new Set(s.gruen);
            g.add(p);
            return { ...prev, [t.id]: { ...s, gruen: g } };
          });
        }
      }
      setKind(t.id, { status: "done", passed: res.kind.passed, issues: res.kind.issues });
    }
    setRunning(false);
  }

  async function pruefen() {
    setPruefBusy(true);
    setFehler(null);
    const res = await auditFamilieKonsistenz(familie.parentId);
    setPruefBusy(false);
    if (res.ok) setAudit(res.kinder);
    else setFehler(res.fehler ?? "Prüfung fehlgeschlagen.");
  }

  const baseZustand = (p: TreePiece): "gruen" | "leer" => (base && base.pieces[p] !== "none" ? "gruen" : "leer");
  function kindZustand(id: string) {
    return (p: TreePiece): "gruen" | "pending" | "leer" => {
      const s = lauf[id];
      if (s?.gruen.has(p)) return "gruen";
      if (s?.status === "running" && PROPAGIERTE_PIECES.includes(p)) return "pending";
      return "leer";
    };
  }

  if (!base) return <p className="text-sm text-muted">Keine Base-Variante gefunden.</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold">3 · Content auf die Geschwister übertragen</p>
        <button onClick={uebertragen} disabled={running || targets.length === 0} className="btn-primary text-sm disabled:opacity-50">
          {running ? "Übertrage …" : `Auf ${targets.length} Geschwister übertragen`}
        </button>
        <button onClick={pruefen} disabled={pruefBusy || running} className="btn-dark text-sm disabled:opacity-50">
          {pruefBusy ? "Prüfe …" : "Konsistenz prüfen"}
        </button>
      </div>

      <p className="text-xs text-muted">
        <span className="mr-3"><span className="text-good">✓</span> Content vorhanden / übertragen</span>
        <span className="mr-3">⏳ wird erzeugt</span>
        <span><span className="text-muted">–</span> nicht angelegt</span>
        {" · Grün = im Tool erstellt (Entwurf), noch nicht Amazon-live."}
      </p>

      {mockWarn && (
        <p className="rounded-xl border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          ⚠ Kein API-Key: „je Variante neu getextet“-Slots tragen den Referenztext statt echter Neutexte. Vor der Freigabe mit echtem Modell erneut übertragen.
        </p>
      )}
      {fehler && <p className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">{fehler}</p>}

      {/* ── Auto-Baum: Base oben, Geschwister aufgefächert darunter ─────────── */}
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-fit min-w-full">
          <div className="flex justify-center">
            <Kachel
              kind={base}
              zustand={baseZustand}
              badge={<span className="inline-block rounded-full bg-[rgb(22_163_74/0.15)] px-2 py-0.5 text-[10px] font-semibold text-good">Base · freigegeben</span>}
            />
          </div>

          {targets.length > 0 && (
            <>
              <div className="mx-auto h-5 w-px bg-hair" />
              <div className="relative flex justify-center gap-5">
                {targets.length > 1 && (
                  <div className="absolute left-[95px] right-[95px] top-0 h-px bg-hair" />
                )}
                {targets.map((t) => {
                  const s = lauf[t.id];
                  const badge =
                    s?.status === "done" ? (
                      s.passed ? (
                        <span className="inline-block rounded-full bg-[rgb(22_163_74/0.15)] px-2 py-0.5 text-[10px] font-semibold text-good">✓ Gate bestanden</span>
                      ) : (
                        <span
                          className="inline-block cursor-help rounded-full bg-bad/10 px-2 py-0.5 text-[10px] font-semibold text-bad"
                          title={(s.issues ?? []).filter((i) => i.severity === "error").map((i) => `${i.rule}: ${i.message}`).join("\n") || undefined}
                        >
                          ✕ {(s.issues ?? []).filter((i) => i.severity === "error").length} Fehler
                        </span>
                      )
                    ) : s?.status === "running" ? (
                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">generiert …</span>
                    ) : undefined;
                  return (
                    <div key={t.id} className="flex flex-col items-center" style={{ width: CHILD_W }}>
                      <div className="h-5 w-px bg-hair" />
                      <Kachel kind={t} zustand={kindZustand(t.id)} badge={badge} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {audit && (
        <div className="grid gap-1.5">
          <p className="text-sm font-semibold">Konsistenz-Prüfung</p>
          {audit.every((a) => a.issues.length === 0) ? (
            <p className="text-sm text-good">✓ Alle „für alle gleich“-Inhalte sind über die Familie identisch.</p>
          ) : (
            audit
              .filter((a) => a.issues.length > 0)
              .map((a) => (
                <div key={a.productId} className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
                  <span className="font-mono">{a.asin}</span>
                  <ul className="mt-1 list-disc pl-4">
                    {a.issues.map((i, n) => (
                      <li key={n}>{i.message}</li>
                    ))}
                  </ul>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
