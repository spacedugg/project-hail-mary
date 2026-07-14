/**
 * Stateless Sessions nach dem reporting-main-Muster: HMAC-SHA256-signierter
 * base64url-JSON-Payload in einem httpOnly-Cookie, 30 Tage gültig.
 * Passwörter: scrypt (Salt 16 B, Key 64 B) als "saltHex:hashHex",
 * Vergleich constant-time. Secret aus AUTH_SECRET (Vercel-Env-Var);
 * ohne Secret läuft ein Dev-Fallback und der Demo-Banner warnt.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "temoa_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

export type SessionUser = { id: string; email: string; name: string; role: "admin" | "member" };

export function authSecret(): string {
  return process.env.AUTH_SECRET ?? "dev-secret-nicht-fuer-produktion";
}
export function hasRealAuthSecret(): boolean {
  return Boolean(process.env.AUTH_SECRET);
}

// ── Passwörter ───────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

// ── Token ────────────────────────────────────────────────────────────────────

const b64url = (b: Buffer) => b.toString("base64url");

function sign(payload: string): string {
  return b64url(createHmac("sha256", authSecret()).update(payload).digest());
}

export function createSessionToken(user: SessionUser): string {
  const payload = b64url(Buffer.from(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE_S * 1000 })));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & { exp: number };
    if (data.exp < Date.now()) return null;
    return { id: data.id, email: data.email, name: data.name, role: data.role };
  } catch {
    return null;
  }
}

// ── Cookie-Helfer (Server Actions / Server Components) ──────────────────────

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_S,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
