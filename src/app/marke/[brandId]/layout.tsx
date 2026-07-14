import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BrandShell } from "@/components/shell";

export const dynamic = "force-dynamic";

/** Marken-Workspace-Rahmen: Sidebar + Marken-Kontext für alle Unterseiten. */
export default async function BrandLayout({
  params,
  children,
}: {
  params: Promise<{ brandId: string }>;
  children: React.ReactNode;
}) {
  const { brandId } = await params;
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
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
