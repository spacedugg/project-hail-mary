import type { Marketplace } from "@/db/schema";
import { marktplatz } from "@/lib/amazon/marketplaces";

/**
 * Produktseiten-Adresse für den Import.
 *
 * `?language=de_DE` ist NICHT optional: Amazon liefert Crawlern und
 * Server-Abrufen je nach Proxy-Standort die englische Fassung derselben
 * Produktseite aus. Im Praxistest (ElbFuchs, 21.07.) kam für amazon.de ein
 * komplett englisches Listing zurück. Für den Soll/Ist-Abgleich ist das fatal:
 * Er meldet dann Abweichungen, die keine sind — nur eine andere Sprachfassung.
 */
export function amazonProduktUrl(asin: string, mp: Marketplace | string = "de"): string {
  const key = (typeof mp === "string" ? mp : "de") as Marketplace;
  const m = marktplatz(key);
  return `https://www.${m.domain}/dp/${asin.toUpperCase()}?language=${m.languageTag}`;
}

const DE_MARKER = /\b(und|der|die|das|für|mit|nicht|auch|oder|ohne|Ihre|unsere)\b|[äöüßÄÖÜ]/g;
const EN_MARKER = /\b(the|and|with|for|your|our|not|also|from|this|glasses|double-walled)\b/gi;

export type SprachBefund = { passt: boolean; erwartet: string; hinweis?: string };

/**
 * Deterministische Sprachprüfung des importierten Textes — keine KI, nur
 * Marker-Zählung. Sie beweist nichts, aber sie fängt den häufigen Fall
 * „englische Fassung statt deutscher" zuverlässig ab, statt ihn stillschweigend
 * in die Datenbank zu lassen.
 */
export function pruefeSprache(text: string, mp: Marketplace | string = "de"): SprachBefund {
  const key = (typeof mp === "string" ? mp : "de") as Marketplace;
  const erwartet = marktplatz(key).languageTag;
  if (!erwartet.startsWith("de")) return { passt: true, erwartet };
  const probe = (text ?? "").slice(0, 4000);
  if (probe.trim().length < 40) return { passt: true, erwartet };

  const de = (probe.match(DE_MARKER) ?? []).length;
  const en = (probe.match(EN_MARKER) ?? []).length;
  if (en > de * 2 && en >= 3)
    return {
      passt: false,
      erwartet,
      hinweis:
        `Der Import sieht englischsprachig aus, erwartet war ${erwartet}. ` +
        "Amazon liefert je nach Proxy-Standort die englische Fassung aus — der Soll/Ist-Abgleich würde " +
        "daraus Abweichungen melden, die keine sind. Import bitte wiederholen.",
    };
  return { passt: true, erwartet };
}
