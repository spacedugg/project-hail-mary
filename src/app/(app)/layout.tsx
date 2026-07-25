import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { DemoBanner } from "@/components/shell";

/**
 * Session-Guard: alles in der (app)-Gruppe braucht ein angemeldetes Konto (D57).
 * Der Demo-Banner sitzt hier statt im Root-Layout — die öffentliche
 * Kunden-Freigabeseite (/freigabe/[token]) darf keine internen Hinweise auf
 * fehlende API-Schlüssel zeigen.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DemoBanner />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
