"use client";

import { useState } from "react";
import { BILD_TYP_LABELS, istBildTyp } from "@/lib/analysis/bildTypen";
import { AUDIT_DIMENSIONEN, AUDIT_LABELS } from "@/lib/analysis/bildAudit";

/**
 * Bild-Analyse als greifbare Kacheln (D215, Nutzer-Vorgabe 27.07.): je gescraptem
 * Bild eine Karte mit (a) klick-/vergrößerbarem Bild, (b) Typ, (c) was auf dem
 * Bild erkannt wurde, (d) den 4 Faktoren als Balken (schwächster hervorgehoben)
 * und (e) der Begründung des schwächsten Faktors (warum + wie besser).
 *
 * Ersetzt die alte Mini-Galerie (Bilder zu klein, nicht klickbar) + die reine
 * Zahlen-Liste (wirkte „random", keine Begründung sichtbar). Die Begründungen
 * lagen längst in den Audit-Daten, wurden aber nie angezeigt.
 */

type Faktor = { score: number | null; wasWirSehen: string; warum: string; wieBesser: string };
type Bild = {
  slot: number;
  typ?: string | null;
  inhalt: string;
  textImBild: string[];
  claims: string[];
  faktoren?: Record<string, Faktor> | null;
};

const farbe = (s: number | null) => (s === null ? "bg-hair" : s >= 4 ? "bg-emerald-500" : s >= 3 ? "bg-amber-500" : "bg-red-500");

export function BildKacheln({ imageUrls, bilder }: { imageUrls: string[]; bilder: Bild[] }) {
  const [gross, setGross] = useState<string | null>(null);
  const bySlot = new Map(bilder.map((b) => [b.slot, b]));
  const hatAudit = bilder.some((b) => b.faktoren);

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {imageUrls.slice(0, 9).map((url, i) => {
          const b = bySlot.get(i + 1);
          const faktoren = b?.faktoren ?? null;
          let min: { d: (typeof AUDIT_DIMENSIONEN)[number]; s: number } | null = null;
          if (faktoren) {
            for (const d of AUDIT_DIMENSIONEN) {
              const s = faktoren[d]?.score;
              if (typeof s === "number" && (min === null || s < min.s)) min = { d, s };
            }
          }
          const minFaktor = min ? faktoren![min.d] : null;
          return (
            <div key={i} className="flex flex-col rounded-xl border border-hair p-2">
              <button
                type="button"
                onClick={() => setGross(url)}
                className="group relative block overflow-hidden rounded-lg border border-hair bg-white"
                title="Zum Vergrößern klicken"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Bild ${i + 1}`} className="aspect-square w-full object-contain" />
                <span className="absolute inset-0 hidden place-items-center bg-black/45 text-xs font-medium text-white group-hover:grid">Vergrößern</span>
              </button>
              <div className="mt-1.5 text-[11px] font-semibold">
                Slot {i + 1}
                {istBildTyp(b?.typ) && <span className="font-normal text-muted"> · {BILD_TYP_LABELS[b.typ]}</span>}
              </div>
              {b?.inhalt && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{b.inhalt}</p>}
              {faktoren && (
                <div className="mt-1.5 space-y-1">
                  {AUDIT_DIMENSIONEN.map((d) => {
                    const s = faktoren[d]?.score ?? null;
                    const weak = min?.d === d;
                    return (
                      <div key={d} className="flex items-center gap-1.5" title={AUDIT_LABELS[d]}>
                        <span className={`w-[5.5rem] flex-none truncate text-[10px] ${weak ? "font-medium text-bad" : "text-muted"}`}>{AUDIT_LABELS[d]}</span>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-hair">
                          <div className={`h-full ${farbe(s)}`} style={{ width: s === null ? "0%" : `${(s / 5) * 100}%` }} />
                        </div>
                        <span className="w-4 flex-none text-right text-[10px] tabular-nums text-muted">{s === null ? "–" : s}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {minFaktor && (minFaktor.wieBesser || minFaktor.warum) && (
                <p className="mt-1.5 text-[10px] leading-snug text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium text-bad">Schwächster – {AUDIT_LABELS[min!.d]}:</span> {minFaktor.wieBesser || minFaktor.warum}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!hatAudit && (
        <p className="mt-2 text-[11px] text-muted">
          Inhalt &amp; Typ je Bild erfasst. Die 4-Faktoren-Bewertung (Design, Wertigkeit, Botschaft) kommt mit einem Listing-Import bei aktivem KI-Schlüssel dazu.
        </p>
      )}

      {gross && (
        <div
          onClick={() => setGross(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gross} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-[88vw] rounded-lg bg-white object-contain shadow-2xl" />
          <button type="button" className="absolute right-6 top-6 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-neutral-900">Schließen ✕</button>
        </div>
      )}
    </div>
  );
}
