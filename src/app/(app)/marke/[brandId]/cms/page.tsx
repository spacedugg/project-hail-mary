import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Alte CMS-Route → Content-Verwaltung (Katalog + Publish-Bereich). */
export default async function CmsRedirect({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  redirect(`/marke/${brandId}/katalog`);
}
