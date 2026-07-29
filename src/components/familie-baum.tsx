"use client";

import { useState } from "react";
import Link from "next/link";
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
import { amazonProduktUrl } from "@/lib/scrape/amazonUrl";

/**
 * Familien-Baum (D236/D238, Nutzer-Wunsch): freigegebene Base-ASIN oben,
 * Geschwister darunter aufgefächert und per Linie verbunden. „Auf Geschwister
 * übertragen" läuft Kind für Kind LIVE.
 *
 * Häkchen-Logik (D238, Nutzer-Korrektur):
 * - WEISSER Haken  = dieses Piece SOLL generiert werden (ist im Plan/Master).
 * - GRÜNER Haken   = wurde gerade generiert (Fortschritt dieses Laufs).
 * - Sanduhr        = wird gerade erzeugt.
 * - graues Minus   = nicht Teil des Plans (kein Master-Piece).
 * Die Geschwister starten also WEISS und werden Piece für Piece grün.
 *
 * Fehler werden je Kind AUSGESCHRIEBEN (Regel + Klartext), nicht nur als Zahl —
 * der Nutzer muss sehen, WARUM/WO das Gate anschlägt (D238). Jede Kachel ist
 * klickbar und führt zum Content der ASIN.
 */

const CHILD_W = 200; // px — feste Kachelbreite, damit die Verbindungslinien passen
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Zustand = "gruen" | "weiss" | "pending" | "leer";
type KindLauf = {
  status: "idle" | "running" | "done";
  gruen: Set<TreePiece>;
  passed?: boolean;
  issues?: ValidationIssue[];
};

function PieceZeile({ label, zustand }: { label: string; zustand: Zustand }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px]">
      {zustand === "gruen" ? (
        <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-[rgb(22_163_74/0.15)] text-[10px] text-good">✓</span>
      ) : zustand === "weiss" ? (
        <span className="grid h-4 w-4 flex-none place-items-center rounded-full border border-hair bg-[var(--surface)] text-[10px] text-foreground">✓</span>
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
  href,
  zustand,
  fuss,
}: {
  kind: FamilienKind;
  href: string;
  zustand: (p: TreePiece) => Zustand;
  fuss?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-hair bg-[var(--surface)] p-2.5 shadow-sm" style={{ width: CHILD_W }}>
      {/* Klickbarer Kopf → Content der ASIN (D238). Bild + Titel führen intern zum Content. */}
      <Link href={href} className="block rounded-lg outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary" title="Content dieser ASIN öffnen">
        <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-hair bg-white">
          {kind.bildUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={kind.bildUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-muted">kein Bild</span>
          )}
        </div>
        {kind.titel && kind.titel !== kind.asin && (
          <div className="mt-1.5 truncate text-[11px] font-medium text-foreground" title={kind.titel}>{kind.titel}</div>
        )}
      </Link>
      {/* Statt die ASIN klein zu wiederholen (D241): Direktlink aufs aktuelle Amazon-Listing.
          MUSS außerhalb des internen <Link> stehen — verschachtelte <a> sind ungültig. */}
      {kind.asin ? (
        <a
          href={amazonProduktUrl(kind.asin, kind.marketplace)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary-strong underline decoration-dotted underline-offset-2 hover:opacity-80"
          title={`Amazon-Listing öffnen (${kind.asin})`}
        >
          auf Amazon öffnen ↗
        </a>
      ) : (
        <div className="mt-1 text-[11px] text-muted">keine ASIN</div>
      )}
      <ul className="mt-1.5 space-y-1">
        {TREE_PIECES.map((p) => (
          <PieceZeile key={p} label={TREE_PIECE_LABEL[p]} zustand={zustand(p)} />
        ))}
      </ul>
      {fuss && <div className="mt-2">{fuss}</div>}
    </div>
  );
}

/** Fehler/Warnungen eines Kindes ausgeschrieben — aufklappbar, nicht nur als Zahl. */
function GateBefund({ issues }: { issues: ValidationIssue[] }) {
  const fehler = issues.filter((i) => i.severity === "error");
  const warn = issues.filter((i) => i.severity === "warning");
  if (fehler.length === 0 && warn.length === 0)
    return <span className="inline-block rounded-full bg-[rgb(22_163_74/0.15)] px-2 py-0.5 text-[10px] font-semibold text-good">✓ Gate bestanden</span>;
  return (
    <details className="rounded-lg border border-bad/40 bg-bad/5">
      <summary className="cursor-pointer px-2 py-1 text-[10px] font-semibold text-bad">
        ✕ {fehler.length} Fehler{warn.length ? ` · ${warn.length} Hinweise` : ""} — Gründe zeigen
      </summary>
      <ul className="space-y-1 px-2 pb-2 pt-1">
        {[...fehler, ...warn].map((i, n) => (
          <li key={n} className="text-[10px] leading-snug">
            <span className={i.severity === "error" ? "text-bad" : "text-amber-600"}>{i.severity === "error" ? "✕" : "△"}</span>{" "}
            <span className="font-mono text-[9px] text-muted">{i.rule}</span>
            <br />
            <span className="text-foreground/80">{i.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function FamilieBaum({ familie }: { familie: FamilienDaten }) {
  const baseAsin = familie.master?.baseChildAsin ?? null;
  const base =
    familie.kinder.find((k) => (k.asin ?? k.id) === baseAsin) ??
    familie.kinder.find((k) => k.hatFreigegebenenContent) ??
    null;
  const targets = familie.kinder.filter((k) => k !== base);

  // Geschwister starten WEISS (Plan) — gruen-Set leer, füllt sich beim Übertragen (D238).
  const [lauf, setLauf] = useState<Record<string, KindLauf>>(() =>
    Object.fromEntries(targets.map((t) => [t.id, { status: "idle", gruen: new Set<TreePiece>() } as KindLauf])),
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
    // Zurück auf Start: alle Geschwister wieder WEISS, damit der Fortschritt sichtbar läuft.
    setLauf(Object.fromEntries(targets.map((t) => [t.id, { status: "idle", gruen: new Set<TreePiece>() } as KindLauf])));
    for (const t of targets) {
      setKind(t.id, { status: "running", gruen: new Set() });
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

  const baseZustand = (p: TreePiece): Zustand => (base && base.pieces[p] !== "none" ? "gruen" : "leer");
  function kindZustand(id: string) {
    return (p: TreePiece): Zustand => {
      const s = lauf[id];
      if (s?.gruen.has(p)) return "gruen";
      if (s?.status === "running" && PROPAGIERTE_PIECES.includes(p)) return "pending";
      if (PROPAGIERTE_PIECES.includes(p)) return "weiss"; // im Plan, noch nicht generiert
      return "leer"; // nicht Teil des Masters
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
        <span className="mr-3"><span className="text-foreground">✓ weiß</span> = geplant / im Master</span>
        <span className="mr-3"><span className="text-good">✓ grün</span> = generiert</span>
        <span className="mr-3">⏳ wird erzeugt</span>
        <span><span className="text-muted">–</span> nicht Teil des Masters</span>
        {" · Grün = im Tool erstellt (Entwurf), noch nicht Amazon-live. Kachel anklicken öffnet den Content."}
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
              href={`/produkte/${base.id}?tab=content`}
              zustand={baseZustand}
              fuss={<span className="inline-block rounded-full bg-[rgb(22_163_74/0.15)] px-2 py-0.5 text-[10px] font-semibold text-good">Base · freigegeben</span>}
            />
          </div>

          {targets.length > 0 && (
            <>
              <div className="mx-auto h-5 w-px bg-hair" />
              <div className="relative flex justify-center gap-5">
                {targets.length > 1 && <div className="absolute left-[100px] right-[100px] top-0 h-px bg-hair" />}
                {targets.map((t) => {
                  const s = lauf[t.id];
                  const fuss =
                    s?.status === "done" ? (
                      <GateBefund issues={s.issues ?? []} />
                    ) : s?.status === "running" ? (
                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">generiert …</span>
                    ) : undefined;
                  return (
                    <div key={t.id} className="flex flex-col items-center" style={{ width: CHILD_W }}>
                      <div className="h-5 w-px bg-hair" />
                      <Kachel kind={t} href={`/produkte/${t.id}?tab=content`} zustand={kindZustand(t.id)} fuss={fuss} />
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
