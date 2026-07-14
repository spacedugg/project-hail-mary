"use server";

/**
 * Anmeldung/Konto (D57): agentur-interne Nutzer, jeder mit eigenem Konto.
 * Erster registrierter Nutzer wird admin, alle weiteren member.
 * Fehler landen als ?fehler=… in der URL (Server-Action + redirect, kein JS nötig).
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import {
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/session";
import { randomUUID } from "node:crypto";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(`/login?fehler=${encodeURIComponent("Bitte E-Mail und Passwort eingeben.")}`);

  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect(`/login?fehler=${encodeURIComponent("E-Mail oder Passwort falsch.")}`);
  }
  await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/");
}

export async function register(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !email.includes("@")) redirect(`/login?tab=neu&fehler=${encodeURIComponent("Bitte Name und gültige E-Mail angeben.")}`);
  if (password.length < 8) redirect(`/login?tab=neu&fehler=${encodeURIComponent("Passwort braucht mindestens 8 Zeichen.")}`);

  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) redirect(`/login?fehler=${encodeURIComponent("Konto existiert schon — bitte anmelden.")}`);

  const anyUser = await db.query.users.findFirst();
  const user = {
    id: randomUUID(),
    email,
    name,
    passwordHash: hashPassword(password),
    role: (anyUser ? "member" : "admin") as "admin" | "member",
  };
  await db.insert(schema.users).values(user);
  await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

export async function updateProfile(formData: FormData) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = await getDb();
  await db.update(schema.users).set({ name }).where(eq(schema.users.id, session.id));
  await setSessionCookie({ ...session, name });
  revalidatePath("/einstellungen");
}

export async function changePassword(formData: FormData) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) redirect(`/einstellungen?fehler=${encodeURIComponent("Neues Passwort braucht mindestens 8 Zeichen.")}`);

  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.id) });
  if (!user || !verifyPassword(current, user.passwordHash)) {
    redirect(`/einstellungen?fehler=${encodeURIComponent("Aktuelles Passwort falsch.")}`);
  }
  await db.update(schema.users).set({ passwordHash: hashPassword(next) }).where(eq(schema.users.id, session.id));
  redirect(`/einstellungen?ok=${encodeURIComponent("Passwort geändert.")}`);
}
