"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runPipelineStufe, type PipelineErgebnis } from "@/app/actions";
import { AsinChips } from "@/components/asin-chips";

/**
 * Start-Maske + Ein-Klick-Pipeline (D172, Nutzer-Vorgabe 22.07.): EINE Maske
 * fragt alles zugleich ab (Wettbewerber-ASINs, Content-Auswahl), EIN Klick
 * fährt alle Etappen automatisch NACHEINANDER — je Etappe ein Request
 * (D136-Etappen-Prinzip), Fortschritt sichtbar, fehlgeschlagene Etappen
 * einzeln erneut anstoßbar.
 */

const SEKTIONEN = [
  { key: "title", label: "Titel" },
  { key: "bullets", label: "Bullet Points" },
  { key: "highlights", label: "Item Highlights" },
  { key: "backend", label: "Backend-Keywords" },
  { key: "description", label: "Beschreibung" },
  { key: "qa", label: "Q&A" },
] as const;

type Etappe = {
  stufe: "listing" | "scrape" | "auswertung" | "verdichtung" | "blocker" | "content";
  section?: string;
  label: string;
  status: "offen" | "laeuft" | "fertig" | "fehler";
  detail?: string;
  /** Harte Abhängigkeit: scheitert sie, stoppt der Lauf (spätere Etappen brauchen sie). */
  hart: boolean;
};

export function AnalyseStart({ productId, mainAsin }: { productId: string; mainAsin: string | null }) {
  const router = useRouter();
  const [etappen, setEtappen] = useState<Etappe[]>([]);
  const [asins, setAsins] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);

  const setzeStatus = (i: number, status: Etappe["status"], detail?: string) =>
    setEtappen((prev) => prev.map((e, n) => (n === i ? { ...e, status, detail } : e)));

  const fahre = async (plan: Etappe[], ab: number, asinListe: string[]) => {
    setLaeuft(true);
    for (let i = ab; i < plan.length; i++) {
      const e = plan[i];
      if (e.status === "fertig") continue;
      setzeStatus(i, "laeuft");
      let res: PipelineErgebnis;
      try {
        res = await runPipelineStufe(
          productId,
          e.stufe,
          e.stufe === "scrape" ? { asins: asinListe } : e.section ? { section: e.section } : undefined,
        );
      } catch (err) {
        res = { ok: false, fehler: err instanceof Error ? err.message : String(err), code: "ALG-00" };
      }
      if (!res.ok) {
        setzeStatus(i, "fehler", `${res.fehler}${res.code ? ` (${res.code})` : ""}`);
        if (e.hart) {
          setLaeuft(false);
          return;
        }
        continue;
      }
      setzeStatus(i, "fertig", res.hinweis);
      router.refresh();
    }
    setLaeuft(false);
    setFertig(true);
    router.refresh();
  };

  const starte = async (fd: FormData) => {
    const liste = [...new Set(String(fd.get("asins") ?? "").split(/[\s,;]+/).map((a) => a.trim().toUpperCase()).filter(Boolean))];
    const sections = fd.getAll("sections").map(String);
    const plan: Etappe[] = [
      { stufe: "listing", label: "Amazon Listing laden (Texte, Bilder, Bildanalyse)", status: "offen", hart: true },
      { stufe: "scrape", label: `Reviews scrapen (${liste.length} ASIN${liste.length === 1 ? "" : "s"})`, status: "offen", hart: true },
      { stufe: "auswertung", label: "Reviews auswerten (Pain Points, Kaufauslöser)", status: "offen", hart: true },
      { stufe: "verdichtung", label: "Erkenntnisse verdichten", status: "offen", hart: false },
      { stufe: "blocker", label: "Conversion-Blocker finden", status: "offen", hart: false },
      ...sections.map((s) => ({
        stufe: "content" as const,
        section: s,
        label: `${SEKTIONEN.find((x) => x.key === s)?.label ?? s} texten`,
        status: "offen" as const,
        hart: false,
      })),
    ];
    setEtappen(plan);
    setAsins(liste);
    await fahre(plan, 0, liste);
  };

  const fehlerIndex = etappen.findIndex((e) => e.status === "fehler");

  if (etappen.length > 0) {
    return (
      <div className="mt-4 rounded-xl border border-hair p-4">
        <h3 className="text-sm font-semibold">{fertig ? "Fertig" : laeuft ? "Analyse läuft" : "Analyse unterbrochen"}</h3>
        <ul className="mt-3 space-y-1.5">
          {etappen.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-5 flex-none text-center">
                {e.status === "fertig" ? <span className="text-good">✓</span>
                  : e.status === "laeuft" ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                  : e.status === "fehler" ? <span className="text-bad">✕</span>
                  : <span className="text-muted">·</span>}
              </span>
              <span className={e.status === "offen" ? "text-muted" : ""}>
                {e.label}
                {e.status === "fertig" && e.detail && <span className="block text-[11px] text-muted">{e.detail}</span>}
                {e.status === "fehler" && <span className="block text-[11px] text-bad">{e.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        {!laeuft && !fertig && fehlerIndex >= 0 && (
          <button type="button" onClick={() => fahre(etappen, fehlerIndex, asins)} className="btn-primary mt-3 text-xs">
            Ab der fehlgeschlagenen Etappe fortsetzen
          </button>
        )}
        {fertig && (
          <p className="mt-3 text-sm">
            Ergebnis steht in den Reitern oben: Content zuerst, Analyse als Hintergrundwissen.
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted">Der Lauf braucht mehrere Minuten. Seite offen lassen.</p>
      </div>
    );
  }

  return (
    <form
      action={starte}
      className="mt-4 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold">Reviews</h3>
        <p className="mt-1 text-xs text-muted">Die Produkt-ASIN ist gesetzt. Weitere ASINs liefern zusätzliche Kundenstimmen.</p>
        <div className="mt-2">
          <AsinChips name="asins" mainAsin={mainAsin} placeholder="Weitere ASIN eingeben …" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Content</h3>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {SEKTIONEN.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="checkbox" name="sections" value={key} defaultChecked />
              {label}
            </label>
          ))}
        </div>
      </div>
      <button type="submit" disabled={!mainAsin} className="btn-primary disabled:opacity-40">
        Analysieren &amp; Texte erstellen
      </button>
      {!mainAsin && <p className="text-xs text-warn">△ Dafür braucht das Produkt eine ASIN.</p>}
      <p className="text-[11px] text-muted">
        Ein Klick: Listing laden · Bilder analysieren · Reviews scrapen &amp; auswerten · Erkenntnisse verdichten · Blocker finden · gewählten Content texten.
      </p>
    </form>
  );
}
