import { AreaStub } from "@/components/shell";
export default function Page() {
  return (
    <AreaStub
      title="Berichte & Daten"
      purpose="Das Datenwerk: geführter Upload aller Berichtstypen, getaggt mit Marke · Land · Periode. Cerebro-Upload läuft bereits am Produkt — hier entsteht die zentrale Upload-Strecke mit Status je Periode."
      planned={[
        "Geführter Upload: Business Report · SQP · Ads · Search-Term · Cerebro",
        "Status-Matrix: welche Periode hat welche Daten (Lücken sichtbar)",
        "Perioden-Flags (Prime Day, Saison) zur KPI-Kontextualisierung",
        "Später: SP-API / Ads-API statt manuellem Upload (Import-First, API-Ready)",
      ]}
      feeds="Seller Central + Ads-Konsole Exporte · Helium 10"
    />
  );
}
