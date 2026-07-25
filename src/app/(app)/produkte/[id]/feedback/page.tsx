import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Kunden-Feedback lebt zentral auf Markenebene (Nutzer-Entscheidung 23.07.),
 * nicht als Produkt-Reiter. Alte Links landen dort.
 */
export default async function ProduktFeedbackRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) redirect("/");
  redirect(`/marke/${product.brandId}/publish/feedback`);
}
