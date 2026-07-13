import { AreaStub } from "@/components/shell";
export default function Page() {
  return (
    <AreaStub
      title="Handlungen"
      purpose="Der aggregierte Action-Plan über alle Analysen: priorisierte Maßnahmen nach €-Hebel, auf Account- und ASIN-Ebene. Die regelbasierte Action-Plan-Engine ist aus reporting-main portierbar; erste Empfehlungen erscheinen bereits in der Listing-Analyse je Produkt."
      planned={[
        "Priorisierte Maßnahmen nach Uplift (Content · PPC · Listing · Produkt)",
        "Status-Tracking: offen / in Arbeit / erledigt",
        "Quellen-Verknüpfung: jede Maßnahme zeigt ihre Analyse-Herkunft",
      ]}
      feeds="Listing-Analysen (vorhanden) · SQP/N-Gram-Engines (portierbar)"
    />
  );
}
