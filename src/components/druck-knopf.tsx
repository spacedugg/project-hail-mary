"use client";

/**
 * „Als PDF speichern" ist der Druckdialog dieser Seite (D267) — kein
 * Server-Rendering, keine zweite Vorlage, die vom Bildschirm abweichen kann.
 * Im Dialog wählt der Kunde „Als PDF speichern"; das Print-Stylesheet setzt
 * A4-Ränder und die Kapitel-Umbrüche.
 */
export function DruckKnopf() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-dark text-xs">
      Als PDF speichern
    </button>
  );
}
