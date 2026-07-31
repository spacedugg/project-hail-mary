/**
 * Beleg-Relevanz — EINE Formel für alle Karten-Arten (D154/D266).
 *
 * Lag bisher in `featureRanking.ts` und wurde von dort auch vom Blocker-Lauf
 * benutzt; die Verdichtung nahm stattdessen die LLM-Angabe. Damit hatten zwei
 * Listen zwei Maßstäbe und waren nicht vergleichbar. Ein Import aus
 * `featureRanking.ts` in die Verdichtung wäre ein Laufzeit-Zyklus (dort wird
 * `filtereEinzelnennungen` importiert) — deshalb dieses eigene, abhängigkeitsfreie
 * Modul.
 *
 * Relevanz aus der ANZAHL zugeordneter, verifizierter Beleg-Aspekte:
 * 0 → 1 · 1 → 3 · 2 → 4 · ≥3 → 5.
 */
export function belegRelevanz(anzahlBelegAspekte: number): number {
  return anzahlBelegAspekte >= 3 ? 5 : anzahlBelegAspekte === 2 ? 4 : anzahlBelegAspekte === 1 ? 3 : 1;
}
