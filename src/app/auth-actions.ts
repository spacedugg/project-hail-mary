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
  revalidatePath("/konto");
}

export async function changePassword(formData: FormData) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) redirect(`/konto?fehler=${encodeURIComponent("Neues Passwort braucht mindestens 8 Zeichen.")}`);

  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.id) });
  if (!user || !verifyPassword(current, user.passwordHash)) {
    redirect(`/konto?fehler=${encodeURIComponent("Aktuelles Passwort falsch.")}`);
  }
  await db.update(schema.users).set({ passwordHash: hashPassword(next) }).where(eq(schema.users.id, session.id));
  redirect(`/konto?ok=${encodeURIComponent("Passwort geändert.")}`);
}

/**
 * Team-Mitglied löschen (D279, Nutzer-Vorgabe 02.08.2026).
 *
 * Warum das ins Tool gehört: Vergessene Zugänge sind ein Alltagsfall. Bisher gab
 * es dafür KEINEN Weg in der Oberfläche — die Team-Liste war reine Anzeige, und
 * das Konto liess sich nur direkt in der Datenbank entfernen. Damit war eine
 * gewöhnliche Verwaltungsaufgabe nur mit SQL lösbar; genau das ist kein Zustand
 * für ein Tool, das man bedienen soll.
 *
 * Am Konto hängen bewusst keine Arbeitsdaten: Marken, Produkte, Keywords und
 * Content hängen an `clients`/`brands`. Die drei Verweise auf `users` sind
 * `content_feedback.autor_user_id` und `audit_logs.user_id` (beide `set null` —
 * Kommentare und Protokoll bleiben vollständig, nur die Zuordnung entfällt)
 * sowie `amazon_oauth_states` (`cascade`, kurzlebige Zwischenzustände).
 *
 * Zwei harte Sicherungen:
 *  1. NIEMALS das eigene Konto — sonst arbeitet man mit einer Session weiter,
 *     deren Nutzer nicht mehr existiert, und sperrt sich im Zweifel selbst aus.
 *  2. NIEMALS das letzte Konto — eine Installation ohne jeden Zugang wäre nur
 *     noch über die Datenbank zu retten.
 */
export async function deleteTeamMember(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const zurueck = "/einstellungen";
  if (!userId) redirect(`${zurueck}?fehler=${encodeURIComponent("Kein Konto angegeben.")}`);

  const session = await getSessionUser();
  if (!session) redirect("/login");

  if (userId === session.id) {
    redirect(
      `${zurueck}?fehler=${encodeURIComponent("Das eigene Konto lässt sich hier nicht löschen — sonst wärst du mitten in der Sitzung ausgesperrt. Dafür ein zweites Konto anlegen, damit anmelden und dieses hier von dort löschen.")}`,
    );
  }

  const db = await getDb();
  const ziel = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!ziel) redirect(`${zurueck}?fehler=${encodeURIComponent("Dieses Konto gibt es nicht mehr.")}`);

  const alle = await db.query.users.findMany();
  if (alle.length <= 1) {
    redirect(`${zurueck}?fehler=${encodeURIComponent("Das ist das letzte Konto — es kann nicht gelöscht werden, sonst käme niemand mehr ins Tool.")}`);
  }

  await db.delete(schema.users).where(eq(schema.users.id, userId));
  revalidatePath(zurueck);
  redirect(`${zurueck}?hinweis=${encodeURIComponent(`Konto „${ziel!.email}" gelöscht — die Adresse ist wieder frei.`)}`);
}
