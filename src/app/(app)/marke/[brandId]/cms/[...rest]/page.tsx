import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Alte CMS-Unterseiten (publish, abgleich, feedback) → neuer Bereich. */
export default async function CmsUnterseiteRedirect({
  params,
}: {
  params: Promise<{ brandId: string; rest: string[] }>;
}) {
  const { brandId, rest } = await params;
  const ziel: Record<string, string> = { publish: "dateien", abgleich: "alerts", feedback: "feedback" };
  redirect(`/marke/${brandId}/publish/${ziel[rest[0]] ?? ""}`);
}
