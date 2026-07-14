import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BrandShell } from "@/components/shell";

export const dynamic = "force-dynamic";

/**
 * Produkt-Seiten laufen im selben Marken-Workspace-Rahmen wie alles andere —
 * EIN Design, EINE Bedienung (Nutzer-Vorgabe): Sidebar bleibt stehen,
 * die Marke wird über das Produkt aufgelöst.
 */
export default async function ProduktLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  if (!brand) notFound();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, brand.clientId) });
  const allBrands = await db.query.brands.findMany();

  return (
    <BrandShell
      brand={{ id: brand.id, name: brand.name, clientName: client?.name ?? "" }}
      allBrands={allBrands.map((b) => ({ id: b.id, name: b.name }))}
    >
      {children}
    </BrandShell>
  );
}
