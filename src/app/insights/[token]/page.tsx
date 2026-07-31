import { ladeInsightsReport } from "@/lib/reports/insightsLauf";
import { InsightsDokument } from "@/components/insights-dokument";
import { DruckKnopf } from "@/components/druck-knopf";

export const dynamic = "force-dynamic";

/**
 * Öffentliche Kunden-Seite des Insights-Dokuments (D267).
 *
 * Kein Login, nur der Token — wie bei der Content-Freigabe. Der Kunde sieht
 * ausschließlich dieses eine, eingefrorene Dokument: keine anderen Produkte,
 * keine internen Zahlen, kein Zugang zum Tool.
 *
 * „Als PDF speichern" ist der Druckdialog auf genau dieser Seite. Damit gibt es
 * keine zweite Vorlage, die vom Bildschirm abweichen kann.
 */
export default async function InsightsSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await ladeInsightsReport(token);

  if (!res.ok) {
    return (
      <main className="mx-auto max-w-lg p-10">
        <div className="card p-6">
          <h1 className="page-title">Kein Zugriff</h1>
          <p className="page-sub">{res.grund}</p>
          <p className="mt-4 text-xs text-muted">
            Bitte fordern Sie bei Ihrer Ansprechpartnerin oder Ihrem Ansprechpartner einen neuen Link an.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
      <div className="kein-druck mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wide text-muted">temoa OS · Listing-Insights</span>
        <DruckKnopf />
      </div>

      <InsightsDokument p={res.payload} version={res.version} />

      <p className="kein-druck mt-10 text-center text-[11px] text-muted">
        temoa OS · Dieses Dokument ist ein eingefrorener Stand. Ein neuer Analyse-Lauf erzeugt eine neue Version.
      </p>
    </main>
  );
}
