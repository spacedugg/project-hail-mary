/**
 * Apify-Fehler in verständliche deutsche Meldungen übersetzen (D80).
 * Wichtigster Fall: "full-permission-actor-not-approved" — der Actor braucht
 * EINMALIG die Freigabe im Apify-Konto (Klick auf den Freigabe-Link), danach
 * läuft er dauerhaft. Ohne Übersetzung stand hier rohes JSON im Banner.
 */
export function friendlyApifyError(status: number, body: string, actor: string): string {
  let type = "";
  let message = "";
  try {
    const parsed = JSON.parse(body) as { error?: { type?: string; message?: string } };
    type = parsed.error?.type ?? "";
    message = parsed.error?.message ?? "";
  } catch {
    // kein JSON — Rohtext unten verwenden
  }

  if (type === "full-permission-actor-not-approved") {
    const url = message.match(/https:\/\/\S+/)?.[0] ?? "https://console.apify.com";
    return `Der Scraper (${actor}) braucht einmalig deine Freigabe im Apify-Konto: ${url} — dort auf „Approve" klicken, dann hier einfach erneut versuchen.`;
  }
  if (status === 401 || type === "user-not-authenticated") {
    return "Apify-Zugang abgelehnt (401) — APIFY_API_KEY in Vercel prüfen (Settings → Environment Variables, dann Redeploy).";
  }
  if (status === 402 || type.includes("limit")) {
    return `Apify-Konto am Limit (${status}): ${message || "Guthaben/Plan im Apify-Konto prüfen."}`;
  }
  return `Apify ${status} (Actor ${actor}): ${(message || body).slice(0, 250)}`;
}
