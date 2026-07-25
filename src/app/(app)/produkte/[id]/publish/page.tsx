import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Publish ist EIN Schritt der Content-Verwaltung (erstellen → speichern →
 * publishen → überwachen), nicht ihr Ersatz. Kurzzeitig hieß der Reiter so —
 * korrigiert am 22.07.
 */
export default async function PublishRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/produkte/${id}/content`);
}
