import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

/** Session-Guard: alles in der (app)-Gruppe braucht ein angemeldetes Konto (D57). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
