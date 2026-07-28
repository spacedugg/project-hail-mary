/**
 * ASIN-Kopf: Titel + optionale ASIN-Unterzeile — OHNE Dopplung.
 *
 * WARUM DIESE FUNKTION EXISTIERT (D237, Nutzer 28.07.):
 * Es ist Schwachsinn, dieselbe ASIN direkt untereinander ZWEIMAL zu zeigen —
 * einmal fett als „Name" und einen Zeilenumbruch später nochmal als Mono-ASIN —
 * nur weil bei manchen Produkten `name === asin` ist. Das ist reine Redundanz
 * und verwirrt.
 *
 * Diese Funktion ist die EINE Stelle, die das verhindert: Ist der Name nichts
 * anderes als die ASIN, gibt es KEINE Unterzeile. Überall, wo eine ASIN mit
 * Titel dargestellt wird (Board, Feedback-Tabelle, Kundenportal, Überwachung),
 * IMMER diese Funktion nutzen — niemals `name` und `asin` ungeprüft beide
 * rendern. So kann die Dopplung nicht zurückkommen.
 */
export function asinKopf(name: string | null, asin: string | null): { titel: string; asinSub: string | null } {
  const titel = (name ?? "").trim() || asin || "—";
  const asinSub = asin && asin !== titel ? asin : null;
  return { titel, asinSub };
}
