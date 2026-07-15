import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BrandShell, OsShell } from "@/components/shell";

export const dynamic = "force-dynamic";

/**
 * Produkt-Seiten laufen im selben Rahmen wie alles andere — EIN Design.
 * Marken-Produkte → BrandShell (Marke über das Produkt aufgelöst);
 * Optimizer-Einzelaufträge (workbench, D68) → OsShell, dort ist
 * „Listing Optimizer" der aktive Bereich.
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

  if (brand.kind === "workbench") return <OsShell>{children}</OsShell>;

  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, brand.clientId) });
  const allBrands = await db.query.brands.findMany();

  return (
    <BrandShell
      brand={{ id: brand.id, name: brand.name, clientName: client?.name ?? "" }}
      allBrands={allBrands.filter((b) => b.kind !== "workbench").map((b) => ({ id: b.id, name: b.name }))}
    >
      {children}
    </BrandShell>
  );
}
