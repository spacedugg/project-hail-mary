import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeOffeneFreigaben } from "@/lib/cms/laden";
import { PublishNav } from "@/components/publish-nav";

export const dynamic = "force-dynamic";

/**
 * Content-Verwaltung — die markenweiten Content-Aufgaben.
 *
 * Alles hier läuft über ALLE Produkte einer Marke: Was wartet auf Abnahme,
 * eine Datei für Amazon, wo weicht das Live-Listing ab, was sagt der Kunde.
 * Produktbezogene Inhalte stehen bewusst NICHT hier, sondern im Produkt.
 */
export default async function PublishLayout({
  params,
  children,
}: {
  params: Promise<{ brandId: string }>;
  children: React.ReactNode;
}) {
  const { brandId } = await params;
  const db = await getDb();
  const [freigaben, alerts, feedback] = await Promise.all([
    ladeOffeneFreigaben(brandId),
    db.query.contentAlerts.findMany({
      where: and(eq(schema.contentAlerts.brandId, brandId), eq(schema.contentAlerts.status, "offen")),
    }),
    db.query.contentFeedback.findMany({
      where: and(eq(schema.contentFeedback.brandId, brandId), eq(schema.contentFeedback.status, "offen")),
    }),
  ]);

  return (
    <main className="w-full p-8">
      <h1 className="page-title">Content-Verwaltung</h1>
      <p className="page-sub">
        Der Content-Lebenszyklus <b>über alle Produkte</b> dieser Marke: erstellen → speichern → publishen → überwachen.
        Für ein einzelnes Produkt steht derselbe Lebenszyklus im Produkt selbst.
      </p>
      <PublishNav
        brandId={brandId}
        offeneFreigaben={freigaben.length}
        offeneAlerts={alerts.length}
        // Zählt ASINs mit offener Rückmeldung, NICHT einzelne Zeilen (D237): ein
        // Whole-ASIN-Verdikt fächert auf mehrere Pieces auf — das darf den Badge
        // nicht künstlich hochzählen.
        offenesFeedback={new Set(feedback.map((f) => f.productId)).size}
      />
      {children}
    </main>
  );
}
