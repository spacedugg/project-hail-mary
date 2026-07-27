"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { baueMasterEntwurf, gibMasterFrei, propagiereFamilie, auditFamilieKonsistenz, loeseFamilieAuf } from "@/app/actions";
import type { FamilienDaten } from "@/lib/variants/laden";
import type { MasterSlot, SlotKind } from "@/lib/variants/master";
import type { PropagierKind, FamilieAuditKind } from "@/lib/variants/masterActions";

/**
 * Master-Freigabe & Propagierung einer Variations-Familie (D221/D222).
 * Base-Child wählen → Master ableiten → Slots bestätigen (locked/token/regenerate)
 * → freigeben → auf Geschwister übertragen → Konsistenz prüfen.
 */

const KIND_LABEL: Record<SlotKind, string> = {
  locked: "für alle gleich",
  token: "Achsenwert eingesetzt",
  regenerate: "je Variante neu getextet",
};
const KIND_FARBE: Record<SlotKind, string> = {
  locked: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  token: "bg-[var(--primary-soft)] text-primary-strong",
  regenerate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

export function FamilieManager({ familie }: { familie: FamilienDaten }) {
  const router = useRouter();
  const [baseId, setBaseId] = useState("");
  const [slots, setSlots] = useState<MasterSlot[] | null>(familie.master?.slots ?? null);
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [prop, setProp] = useState<{ mock: boolean; warnung?: string; kinder: PropagierKind[] } | null>(null);
  const [audit, setAudit] = useState<FamilieAuditKind[] | null>(null);

  const baseKandidaten = familie.kinder.filter((k) => k.hatFreigegebenenContent);

  async function ableiten() {
    if (!baseId) return;
    setBusy("ableiten");
    setMeldung(null);
    const res = await baueMasterEntwurf(familie.parentId, baseId);
    setBusy(null);
    if (res.ok) {
      setSlots(res.master.slots);
      setMock(res.mock);
      setMeldung(res.mock ? "Entwurf abgeleitet (Mock: keine LLM-Klassifikation — Slots manuell setzen)." : "Entwurf abgeleitet.");
    } else setMeldung(res.fehler);
  }

  function toggleKind(id: string) {
    setSlots((prev) =>
      prev?.map((s) => {
        if (s.id !== id || s.kind === "token") return s; // token bleibt fix (reiner Code-Tausch)
        return s.kind === "locked"
          ? { ...s, kind: "regenerate", achsen: s.achsen.length ? s.achsen : [...familie.theme] }
          : { ...s, kind: "locked", achsen: [] };
      }) ?? null,
    );
  }

  async function freigeben() {
    if (!slots) return;
    const base = familie.kinder.find((k) => k.id === baseId);
    setBusy("freigeben");
    setMeldung(null);
    const res = await gibMasterFrei(familie.parentId, {
      baseChildAsin: base?.asin ?? baseId,
      theme: familie.theme,
      slots,
    });
    setBusy(null);
    if (res.ok) {
      setMeldung("Master freigegeben.");
      router.refresh();
    } else setMeldung(res.fehler ?? "Freigabe fehlgeschlagen.");
  }

  async function uebertragen() {
    setBusy("uebertragen");
    setMeldung(null);
    setProp(null);
    const res = await propagiereFamilie(familie.parentId);
    setBusy(null);
    if (res.ok) {
      setProp({ mock: res.mock, warnung: res.warnung, kinder: res.kinder });
      router.refresh();
    } else setMeldung(res.fehler ?? "Übertragung fehlgeschlagen.");
  }

  async function pruefen() {
    setBusy("pruefen");
    const res = await auditFamilieKonsistenz(familie.parentId);
    setBusy(null);
    setAudit(res.ok ? res.kinder : null);
    if (!res.ok) setMeldung(res.fehler ?? "Prüfung fehlgeschlagen.");
  }

  async function aufloesen() {
    const frage = `Familie „${familie.name}" auflösen? Die Varianten werden wieder zu Einzel-Produkten${
      familie.istContainer ? " und der Parent-Container wird gelöscht" : " (der Parent bleibt als kaufbares Produkt erhalten)"
    }. Freigegebener Content der Varianten bleibt erhalten.`;
    if (!window.confirm(frage)) return;
    setBusy("aufloesen");
    const res = await loeseFamilieAuf(familie.parentId, familie.brandId);
    setBusy(null);
    if (res.ok) router.push(`/marke/${familie.brandId}/katalog`);
    else setMeldung(res.fehler ?? "Auflösen fehlgeschlagen.");
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Variations-Familie (Parent)</p>
          <h1 className="page-title">{familie.name}</h1>
          <p className="page-sub">
            Achse(n): <b>{familie.theme.join(", ") || "—"}</b> · {familie.kinder.length} Varianten ·{" "}
            {familie.hatMaster ? "Master freigegeben ✓" : "noch kein Master"}
          </p>
        </div>
        <button
          onClick={aufloesen}
          disabled={busy !== null}
          className="flex-none rounded-lg border border-hair px-2.5 py-1 text-xs text-bad hover:bg-bad/5 disabled:opacity-50"
        >
          {busy === "aufloesen" ? "Löse auf…" : "Familie auflösen"}
        </button>
      </div>

      {/* Kinder */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pl-4 pr-3">Variante</th>
              <th className="py-2 pr-3">Achsenwerte</th>
              <th className="py-2 pr-3">Content</th>
              <th className="py-2 pr-4">Base?</th>
            </tr>
          </thead>
          <tbody>
            {familie.kinder.map((k) => (
              <tr key={k.id} className="border-b border-hair/60 last:border-0">
                <td className="py-2 pl-4 pr-3">
                  <Link href={`/produkte/${k.id}`} className="font-mono text-[13px] underline">{k.asin ?? "—"}</Link>
                  {k.istKopf && <span className="ml-1.5 rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] text-primary-strong">Parent</span>}
                  {k.titel && k.titel !== k.asin && <span className="block truncate text-[11px] text-muted">{k.titel}</span>}
                </td>
                <td className="py-2 pr-3 text-xs">{familie.theme.map((a) => `${a}: ${k.axisValues[a] ?? "—"}`).join(" · ")}</td>
                <td className="py-2 pr-3 text-xs">{k.hatFreigegebenenContent ? <span className="text-good">freigegeben</span> : <span className="text-muted">offen</span>}</td>
                <td className="py-2 pr-4">
                  {k.hatFreigegebenenContent && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="radio" name="base" checked={baseId === k.id} onChange={() => setBaseId(k.id)} /> Base
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Schritt 1: Ableiten */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={ableiten} disabled={!baseId || busy !== null} className="btn-dark text-sm disabled:opacity-50">
          {busy === "ableiten" ? "Leite ab…" : "1 · Master aus Base ableiten"}
        </button>
        {baseKandidaten.length === 0 && (
          <span className="text-xs text-muted">Erst für eine Variante Content freigeben (Titel + Bullets + Beschreibung), dann als Base wählen.</span>
        )}
      </div>

      {/* Schritt 2: Slots bestätigen */}
      {slots && (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">2 · Slots bestätigen {mock && <span className="text-amber-600">(Mock — bitte prüfen)</span>}</p>
          <p className="text-xs text-muted">
            <b>für alle gleich</b> = wortgleich übernommen · <b>Achsenwert eingesetzt</b> = automatischer Tausch ·{" "}
            <b>je Variante neu</b> = LLM textet neu. Klick wechselt „gleich" ↔ „neu".
          </p>
          <div className="card divide-y divide-hair overflow-hidden">
            {slots.map((s) => (
              <div key={s.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span className="mt-0.5 w-20 flex-none font-mono text-[11px] text-muted">{s.id}</span>
                <button
                  onClick={() => toggleKind(s.id)}
                  disabled={s.kind === "token"}
                  className={`flex-none rounded px-1.5 py-0.5 text-[11px] ${KIND_FARBE[s.kind]} ${s.kind === "token" ? "cursor-default" : "cursor-pointer hover:opacity-80"}`}
                  title={s.kind === "token" ? "Token-Slot — fester Code-Tausch" : "Klick wechselt gleich ↔ neu"}
                >
                  {KIND_LABEL[s.kind]}
                </button>
                <span className="min-w-0 flex-1 break-words">{s.template}</span>
              </div>
            ))}
          </div>
          <button onClick={freigeben} disabled={busy !== null} className="btn-primary w-fit text-sm disabled:opacity-50">
            {busy === "freigeben" ? "Gebe frei…" : "Master freigeben"}
          </button>
        </div>
      )}

      {/* Schritt 3: Übertragen + Prüfen */}
      {familie.hatMaster && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={uebertragen} disabled={busy !== null} className="btn-primary text-sm disabled:opacity-50">
            {busy === "uebertragen" ? "Übertrage…" : "3 · Auf Geschwister übertragen"}
          </button>
          <button onClick={pruefen} disabled={busy !== null} className="btn-dark text-sm disabled:opacity-50">
            {busy === "pruefen" ? "Prüfe…" : "Konsistenz prüfen"}
          </button>
        </div>
      )}

      {meldung && <p className="text-sm text-muted">{meldung}</p>}

      {prop && (
        <div className="grid gap-1.5">
          {prop.warnung && <p className="rounded-xl border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">⚠ {prop.warnung}</p>}
          {prop.kinder.map((k) => (
            <div key={k.productId} className="rounded-xl border border-hair px-3 py-2 text-sm">
              <span className="font-mono text-[13px]">{k.asin}</span>{" "}
              {k.passed ? <span className="text-good">✓ Gate bestanden</span> : <span className="text-bad">✕ {k.issues.filter((i) => i.severity === "error").length} Fehler</span>}
              {k.issues.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {k.issues.map((i, n) => (
                    <li key={n} className={`text-xs ${i.severity === "error" ? "text-bad" : "text-amber-600"}`}>
                      {i.severity === "error" ? "✕" : "△"} <span className="font-mono">{i.rule}</span> — {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {audit && (
        <div className="grid gap-1.5">
          <p className="text-sm font-semibold">Konsistenz-Prüfung</p>
          {audit.every((a) => a.issues.length === 0) ? (
            <p className="text-sm text-good">✓ Alle „für alle gleich"-Inhalte sind über die Familie identisch.</p>
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
