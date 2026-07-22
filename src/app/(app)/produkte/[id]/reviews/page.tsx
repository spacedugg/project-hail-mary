import { redirect } from "next/navigation";

/** D161: Die Bewertungs-Analyse lebt DIREKT im Reiter — kein Unterlayer mehr. */
export default async function ReviewRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/produkte/${id}?tab=bewertungen`);
}
