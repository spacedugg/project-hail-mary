import { redirect } from "next/navigation";

/**
 * Die Analyse ist keine Extra-Seite mehr (D172, Nutzer-Vorgabe 22.07.):
 * Kontrollvariablen + Maßnahmen stehen im Reiter Amazon Listing, das
 * gebündelte Hintergrundwissen im Reiter Analyse.
 */
export default async function AnalyseRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/produkte/${id}?tab=analyse`);
}
