import { AreaStub } from "@/components/shell";
export default function Page() {
  return (
    <AreaStub
      title="Advertising / PPC"
      purpose="Kampagnen-Portfolio dieser Marke: Wasted Spend, Search-Term-Harvest, Kampagnen aus Templates. Die Rechenlogik (N-Gram, Kampagnen-Builder mit Excel-Export) ist aus den Bestands-Repos portierbar."
      planned={[
        "PPC-Analyse: ACoS/TACoS, PPC-CR, PPC-Anteil, PPC-AOV je Kampagne",
        "Wasted Spend (0 Käufe, ≥5 Klicks) & Harvest-Kandidaten",
        "Kampagnen aus Templates bauen → Amazon-Bulk-Excel-Export",
        "Break-even-ACoS als Schwellenlinie (aus Margen-Modul)",
      ]}
      feeds="Ads-/Search-Term-Berichte (Parser portierbar) · Kampagnen-Builder (temoa-os)"
    />
  );
}
