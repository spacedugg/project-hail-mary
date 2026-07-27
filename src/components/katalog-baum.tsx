"use client";

import { useState } from "react";
import { KatalogZeile, type KatalogZeileProps } from "@/components/katalog-zeile";

/**
 * Katalog-Produktliste als Baum (D221): Standalone-Produkte flach, Variations-
 * Familien mit dem Parent als Kopf-Zeile und den Childs darunter eingerückt,
 * auf-/zuklappbar. Ersetzt die frühere separate „Bestehende Familien"-Liste.
 */
export type BaumKnoten = {
  self: KatalogZeileProps;
  kinder: KatalogZeileProps[];
  /** Gesamtzahl Varianten der Familie (bei Representative-Kopf = Childs + 1, da der Kopf selbst zählt). */
  variantenAnzahl: number;
};

export function KatalogBaum({ knoten }: { knoten: BaumKnoten[] }) {
  // Familien standardmäßig aufgeklappt — der Nutzer sieht sofort, was zusammengehört.
  const [zu, setZu] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setZu((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <tbody>
      {knoten.map((k) => {
        const hatKinder = k.kinder.length > 0;
        const offen = hatKinder && !zu.has(k.self.id);
        return (
          <KatalogZeileGruppe key={k.self.id} knoten={k} offen={offen} onToggle={() => toggle(k.self.id)} />
        );
      })}
    </tbody>
  );
}

function KatalogZeileGruppe({ knoten, offen, onToggle }: { knoten: BaumKnoten; offen: boolean; onToggle: () => void }) {
  const hatKinder = knoten.kinder.length > 0;
  return (
    <>
      <KatalogZeile
        {...knoten.self}
        toggle={hatKinder ? { offen, onToggle } : null}
        varianten={hatKinder ? knoten.variantenAnzahl : undefined}
      />
      {offen && knoten.kinder.map((kind) => <KatalogZeile key={kind.id} {...kind} indent />)}
    </>
  );
}
