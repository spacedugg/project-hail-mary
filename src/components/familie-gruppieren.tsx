"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gruppiereZuFamilie } from "@/app/actions";
import type { GruppierbaresProdukt } from "@/lib/variants/laden";

/**
 * Variations-Familie manuell gruppieren (D221). Standalone-ASINs auswählen,
 * Achse(n) + Achsenwert je Child festlegen, Parent als Container (Default) oder
 * aus einer vorhandenen ASIN. Fehler/Kontrakt-Verstöße kommen von der Action
 * zurück und werden hier gezeigt — nichts wird stillschweigend geschrieben.
 */
export function FamilieGruppieren({ brandId, produkte }: { brandId: string; produkte: GruppierbaresProdukt[] }) {
  const router = useRouter();
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [themeRoh, setThemeRoh] = useState("flavor");
  const [achsenwerte, setAchsenwerte] = useState<Record<string, string>>({}); // key: `${productId}::${achse}`
  const [parentModus, setParentModus] = useState<"container" | "vorhanden">("container");
  const [containerName, setContainerName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [verstoesse, setVerstoesse] = useState<string[]>([]);

  const theme = themeRoh.split(",").map((a) => a.trim()).filter(Boolean);
  const childs = produkte.filter((p) => ausgewaehlt.has(p.id) && p.id !== (parentModus === "vorhanden" ? parentId : ""));

  const toggle = (id: string) =>
    setAusgewaehlt((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setWert = (pid: string, achse: string, wert: string) => setAchsenwerte((w) => ({ ...w, [`${pid}::${achse}`]: wert }));

  async function absenden() {
    setBusy(true);
    setFehler(null);
    setVerstoesse([]);
    const res = await gruppiereZuFamilie({
      brandId,
      parent: parentModus === "container" ? { modus: "container", name: containerName } : { modus: "vorhanden", productId: parentId },
      theme,
      children: childs.map((c) => ({
        productId: c.id,
        axisValues: Object.fromEntries(theme.map((a) => [a, achsenwerte[`${c.id}::${a}`] ?? ""])),
      })),
    });
    setBusy(false);
    if (res.ok) {
      setAusgewaehlt(new Set());
      setAchsenwerte({});
      setContainerName("");
      router.refresh();
    } else {
      setFehler(res.fehler);
      setVerstoesse((res.verstoesse ?? []).map((v) => `${v.feld}: ${v.problem}`));
    }
  }

  if (produkte.length === 0)
    return <p className="text-xs text-muted">Keine standalone-Produkte zum Gruppieren. Lege zuerst ASINs an.</p>;

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">
        Wähle die zusammengehörigen Varianten (≥ 2). Der <b>Parent</b> ist ein nicht kaufbarer Container, der die Familie
        gruppiert. Die <b>Achse</b> ist, worin sich die Varianten unterscheiden (z. B. <code>flavor</code>, <code>size</code>,
        oder mehrere durch Komma).
      </p>

      {/* Achse(n) */}
      <label className="text-xs font-semibold">
        Achse(n) — Komma-getrennt
        <input value={themeRoh} onChange={(e) => setThemeRoh(e.target.value)} placeholder="flavor" className="input-base ml-2 w-56 font-mono text-xs" />
      </label>

      {/* Produktauswahl + Achsenwerte */}
      <div className="card divide-y divide-hair overflow-hidden">
        {produkte.map((p) => {
          const gewaehlt = ausgewaehlt.has(p.id);
          const istParent = parentModus === "vorhanden" && parentId === p.id;
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={gewaehlt} disabled={istParent} onChange={() => toggle(p.id)} />
                <span className="font-mono text-[13px]">{p.asin ?? "—"}</span>
                <span className="text-muted">{p.name}</span>
              </label>
              {istParent && <span className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] text-primary-strong">Parent</span>}
              {gewaehlt && !istParent && (
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {theme.map((a) => (
                    <input
                      key={a}
                      value={achsenwerte[`${p.id}::${a}`] ?? ""}
                      onChange={(e) => setWert(p.id, a, e.target.value)}
                      placeholder={a}
                      className="input-base w-32 text-xs"
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Parent-Wahl */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="pmodus" checked={parentModus === "container"} onChange={() => setParentModus("container")} />
          Neuer Container-Parent
        </label>
        {parentModus === "container" && (
          <input value={containerName} onChange={(e) => setContainerName(e.target.value)} placeholder="Name des Parents (optional)" className="input-base w-64 text-xs" />
        )}
        <label className="flex items-center gap-1.5">
          <input type="radio" name="pmodus" checked={parentModus === "vorhanden"} onChange={() => setParentModus("vorhanden")} />
          Vorhandene ASIN als Parent
        </label>
        {parentModus === "vorhanden" && (
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="input-base w-64 text-xs">
            <option value="">— Parent-Produkt wählen —</option>
            {produkte.map((p) => (
              <option key={p.id} value={p.id}>
                {p.asin} · {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {fehler && (
        <div className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
          <b>{fehler}</b>
          {verstoesse.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {verstoesse.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        onClick={absenden}
        disabled={busy || childs.length < 2 || theme.length === 0}
        className="btn-primary w-fit text-sm disabled:opacity-50"
      >
        {busy ? "Wird gruppiert…" : `Zu Familie gruppieren (${childs.length} Varianten)`}
      </button>
    </div>
  );
}
