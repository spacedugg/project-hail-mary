/**
 * Die EINE Freigabe-Kette.
 *
 * Vorher waren es zwei Mechanismen, die nichts voneinander wussten: die interne
 * Freigabe hing an der Content-Version, die Kundenzustimmung war ein
 * Feedback-Eintrag. An keiner Stelle stand „ist das abgesichert oder nicht".
 *
 *   Entwurf → intern abgenommen → beim Kunden → vom Kunden freigegeben
 *                                            ↘ Änderung gewünscht
 *
 * Wichtig: Alles hängt an der VERSION, nicht am Platz. Wird nach dem Versand
 * neu generiert, ist die Zustimmung des Kunden für den neuen Stand nicht mehr
 * gültig — und die Kette fällt korrekt auf „intern abgenommen" zurück.
 */

export type FreigabeStufe =
  | "leer"
  | "entwurf"
  | "intern"
  | "beim_kunden"
  | "kunde_frei"
  | "kunde_aenderung";

export type FreigabeStand = {
  stufe: FreigabeStufe;
  label: string;
  /** Kurzform für enge Stellen wie die Katalog-Tabelle. */
  kurz: string;
  ton: "good" | "warn" | "bad" | "neutral";
  /** Zählt als abgesichert — nur dann darf bei strenger Marke publiziert werden. */
  abgesichert: boolean;
  detail?: string;
};

const STUFEN: Record<FreigabeStufe, Omit<FreigabeStand, "detail" | "stufe">> = {
  leer: { label: "nichts hinterlegt", kurz: "—", ton: "neutral", abgesichert: false },
  entwurf: { label: "wartet auf interne Abnahme", kurz: "Abnahme offen", ton: "warn", abgesichert: false },
  intern: { label: "intern abgenommen", kurz: "intern ✓", ton: "neutral", abgesichert: false },
  beim_kunden: { label: "beim Kunden", kurz: "beim Kunden", ton: "warn", abgesichert: false },
  kunde_frei: { label: "vom Kunden freigegeben", kurz: "Kunde ✓", ton: "good", abgesichert: true },
  kunde_aenderung: { label: "Kunde wünscht Änderung", kurz: "Änderung", ton: "bad", abgesichert: false },
};

export type FreigabeEingabe = {
  /** Gibt es überhaupt einen Inhalt an diesem Platz? */
  hatInhalt: boolean;
  /** Die wirksame Version (freigegeben) — null, wenn nur ein Entwurf existiert. */
  versionId: string | null;
  freigegeben: boolean;
  sentToClientAt: Date | null;
  /** Rückmeldungen des Kunden zu GENAU dieser Version. */
  kundenFeedback: Array<{ art: "kommentar" | "freigabe" | "aenderung"; status: "offen" | "erledigt"; versionId: string | null; createdAt: Date }>;
};

export function freigabeStand(e: FreigabeEingabe): FreigabeStand {
  if (!e.hatInhalt) return { stufe: "leer", ...STUFEN.leer };
  if (!e.freigegeben) return { stufe: "entwurf", ...STUFEN.entwurf };

  // Nur Rückmeldungen zu GENAU dieser Version zählen. Kritisch (Review 23.07.):
  // Eine Freigabe OHNE Versionsbezug darf NICHT auf jede Version durchschlagen —
  // sonst erbt ein neu generierter Stand die alte Kundenfreigabe, obwohl der
  // Kunde ihn nie gesehen hat. Versionsloses Feedback zählt nur für
  // versionslosen Inhalt (Bilder/Bestand); versionierter Text verlangt die
  // exakte Version.
  const passend = e.kundenFeedback.filter((f) =>
    e.versionId === null ? !f.versionId : f.versionId === e.versionId,
  );
  // Jüngste Kundenaussage gewinnt (Review 23.07.): Gibt der Kunde nach einem
  // offenen Änderungswunsch doch frei, gilt die Freigabe — nicht die feste
  // Reihenfolge.
  const relevanteAussagen = passend
    .filter((f) => f.art === "freigabe" || (f.art === "aenderung" && f.status === "offen"))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const juengste = relevanteAussagen[0];
  if (juengste?.art === "aenderung")
    return { stufe: "kunde_aenderung", ...STUFEN.kunde_aenderung, detail: "Der Kunde hat eine Änderung angefordert." };
  if (juengste?.art === "freigabe") return { stufe: "kunde_frei", ...STUFEN.kunde_frei };

  if (e.sentToClientAt)
    return {
      stufe: "beim_kunden",
      ...STUFEN.beim_kunden,
      detail: `Vorgelegt am ${e.sentToClientAt.toLocaleDateString("de-DE")} — Rückmeldung steht aus.`,
    };

  return { stufe: "intern", ...STUFEN.intern, detail: "Noch nicht beim Kunden." };
}

export const PILL_KLASSE: Record<FreigabeStand["ton"], string> = {
  good: "pill pill-good",
  warn: "pill pill-warn",
  bad: "pill pill-bad",
  neutral: "pill pill-neutral",
};
