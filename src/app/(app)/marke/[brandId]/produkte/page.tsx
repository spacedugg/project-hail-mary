import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Der Bereich heißt „Katalog" (Nutzer-Entscheidung 22.07.) — kurzzeitig „Produkte". */
export default async function ProdukteRedirect({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  redirect(`/marke/${brandId}/katalog`);
}
