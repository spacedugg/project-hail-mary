"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";

/**
 * Fokussierter Freigabe-Durchgang (Nutzer-Wunsch 23.07.).
 *
 * Statt durch alles zu scrollen und zu suchen, wo man freigibt: EIN Baustein
 * nach dem anderen. Oben steht, wo man ist ("Baustein 2 von 4"), darunter der
 * Inhalt, darunter die Entscheidung. Nach jeder Aktion springt es zum nächsten.
 *
 * Wichtig (Bug-Fix 23.07.): Eine Render-Prop-Funktion darf NICHT von einer
 * Server-Komponente an diese Client-Komponente übergeben werden. Deshalb bekommt
 * der Stepper nur SERIALISIERBARE Daten plus die Server-Action (die ist über die
 * Client-Grenze erlaubt) und rendert die Buttons je Variante selbst.
 */

export type StepperBaustein = {
  key: string;
  produktName: string;
  label: string;
  /** Mehrteilige Slots (Bullets) als Liste; Einzeltext als ein Element. */
  werte: string[];
  /** Bild-URL statt Text. */
  bildUrl?: string | null;
  /** Bereits entschieden? Dann übersprungen, aber im Zähler sichtbar. */
  erledigt: boolean;
  /** Kurzer Statustext neben dem Titel. */
  statusText?: string;
  /** Versteckte Formularfelder (productId, versionId, token, slot, brandId …). */
  fields: Record<string, string>;
  /** Interner Modus: Link „In der Werkstatt ändern". */
  werkstattHref?: string;
  /** Kunden-Modus: Freigabe-Button anzeigen? */
  darfFreigeben?: boolean;
  /** Kunden-Modus ohne Ansprechpartner: Namensfeld einblenden. */
  nameFeld?: boolean;
};

type Action = (formData: FormData) => void | Promise<void>;

export function FreigabeStepper({
  bausteine,
  variant,
  action,
  leerText = "Nichts offen — alles erledigt.",
}: {
  bausteine: StepperBaustein[];
  variant: "intern" | "kunde";
  /** Server-Action — bei „intern" approveContent, bei „kunde" kundenFeedback. */
  action: Action;
  leerText?: string;
}) {
  const router = useRouter();
  const offen = bausteine.filter((b) => !b.erledigt);
  const [idx, setIdx] = useState(0);

  if (offen.length === 0) {
    return (
      <div className="rounded-2xl border border-hair p-6 text-center">
        <div className="text-sm font-semibold text-good">✓ {leerText}</div>
        {bausteine.length > 0 && <p className="mt-1 text-xs text-muted">{bausteine.length} Baustein(e) gesichtet.</p>}
      </div>
    );
  }

  const b = offen[Math.min(idx, offen.length - 1)];

  return (
    <div className="rounded-2xl border border-hair bg-surface p-5">
      {/* Fortschritt: wo bin ich */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary-strong">
          Baustein {Math.min(idx, offen.length - 1) + 1} von {offen.length}
        </div>
        <div className="flex gap-1">
          {offen.map((_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i <= idx ? "bg-primary" : "bg-hair"}`} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold">{b.label}</h3>
        <span className="text-sm text-muted">· {b.produktName}</span>
        {b.statusText && <span className="pill pill-warn">{b.statusText}</span>}
      </div>

      {/* Inhalt */}
      <div className="mt-3 rounded-xl border border-hair bg-[var(--sunk,rgb(0_0_0/0.03))] p-4">
        {b.bildUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.bildUrl} alt={b.label} className="max-h-72 rounded-lg border border-hair" />
        ) : b.werte.length > 1 ? (
          <ol className="space-y-1.5">
            {b.werte.map((w, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <span className="mr-1.5 text-muted">{i + 1}.</span>
                {w}
              </li>
            ))}
          </ol>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed">{b.werte[0] ?? "—"}</p>
        )}
      </div>

      {/* Entscheidung — je Variante */}
      {variant === "intern" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form action={action}>
            {Object.entries(b.fields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <SubmitButton className="btn-primary text-sm">✓ Freigeben</SubmitButton>
          </form>
          {b.werkstattHref && (
            <Link href={b.werkstattHref} className="btn-ghost text-sm">In der Werkstatt ändern</Link>
          )}
        </div>
      ) : (
        <form action={action} className="mt-4">
          {Object.entries(b.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {b.nameFeld && <input name="name" placeholder="Ihr Name" className="input-base mb-2 w-full text-sm" />}
          <textarea name="nachricht" rows={2} className="input-base mb-2 w-full text-sm" placeholder="Optional: eine Rückmeldung zu diesem Baustein …" />
          <div className="flex flex-wrap gap-2">
            {b.darfFreigeben && (
              <SubmitButton name="art" value="freigabe" className="btn-primary text-sm">✓ Freigeben</SubmitButton>
            )}
            <SubmitButton name="art" value="aenderung" className="btn-dark text-sm">Änderung wünschen</SubmitButton>
            <SubmitButton name="art" value="kommentar" className="btn-ghost text-sm">Nur kommentieren</SubmitButton>
          </div>
        </form>
      )}

      {/* Navigation zwischen Bausteinen */}
      <div className="mt-4 flex items-center justify-between border-t border-hair pt-3 text-xs text-muted">
        <button
          type="button"
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="rounded-lg px-2 py-1 transition hover:text-foreground disabled:opacity-40"
        >
          ← zurück
        </button>
        <button
          type="button"
          onClick={() => (idx >= offen.length - 1 ? router.refresh() : setIdx(idx + 1))}
          className="rounded-lg px-2 py-1 transition hover:text-foreground"
        >
          {idx >= offen.length - 1 ? "aktualisieren" : "überspringen →"}
        </button>
      </div>
    </div>
  );
}
