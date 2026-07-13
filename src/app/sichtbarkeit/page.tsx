import { AreaStub } from "@/components/shell";
export default function Page() {
  return (
    <AreaStub
      title="Sichtbarkeit & Markt"
      purpose="Die eigene Position im Markt: Share of Voice, organische vs. bezahlte Sichtbarkeit, Wettbewerber-Lücken. Die SOV-Berechnung existiert bereits (Cerebro-Upload am Produkt) — hier entsteht die marken-weite Ansicht."
      planned={[
        "Share of Voice je Marke & Kategorie (aus SOV-Audits aggregiert)",
        "Funnel-Stufen vs. Markt (Impressionen → Klicks → Warenkorb → Käufe)",
        "Opportunity-Matrix (Bubbles: Sichtbarkeit × Suchvolumen)",
        "CR/CTR vs. Marktdurchschnitt + Umsatzpotenzial-Delta",
      ]}
      feeds="Cerebro-CSV (vorhanden) · Search-Query-Performance-Bericht (Parser portierbar aus reporting-main)"
    />
  );
}
