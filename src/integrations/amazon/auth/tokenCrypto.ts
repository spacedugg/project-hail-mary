/**
 * Verschlüsselung der Amazon-Refresh-Tokens (D263).
 *
 * Verfahren: AES-256-GCM — authentifizierte Verschlüsselung, d. h. eine
 * manipulierte Zeile in der Datenbank scheitert beim Entschlüsseln statt
 * stillschweigend Müll zu liefern. Format:
 *
 *     v1:<base64( iv[12] || authTag[16] || ciphertext )>
 *
 * Das `v1:`-Präfix ist Absicht: ein Schlüsselwechsel oder Verfahrenswechsel
 * bekommt später `v2:` und beide sind gleichzeitig lesbar, ohne Rate-Spiele
 * anhand der Länge.
 *
 * Der Schlüssel kommt AUSSCHLIESSLICH aus `AMAZON_TOKEN_ENCRYPTION_KEY`
 * (serverseitig). Er wird nie geloggt, nie an den Client gegeben, nie in einer
 * Fehlermeldung ausgegeben. Fehlt er, scheitert der Aufruf hart — ein
 * Fallback auf „dann eben unverschlüsselt" wäre die schlimmste Variante.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const IV_LEN = 12; // GCM-Standard
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

/**
 * Schlüssel aus der Umgebung lesen. Akzeptiert base64 oder hex, verlangt aber
 * exakt 32 Byte — ein zu kurzer Schlüssel würde sonst still zu schwacher
 * Verschlüsselung führen. Die Fehlermeldung nennt nie den Wert selbst.
 */
function schluessel(): Buffer {
  const roh = process.env.AMAZON_TOKEN_ENCRYPTION_KEY;
  if (!roh) {
    throw new TokenCryptoError(
      "AMAZON_TOKEN_ENCRYPTION_KEY fehlt. 32 Byte Zufall (base64 oder hex) in Vercel unter Settings → Environment Variables setzen.",
    );
  }
  // hex zuerst probieren (eindeutig erkennbar), sonst base64.
  const kandidaten = /^[0-9a-fA-F]{64}$/.test(roh)
    ? [Buffer.from(roh, "hex"), Buffer.from(roh, "base64")]
    : [Buffer.from(roh, "base64")];

  const passend = kandidaten.find((b) => b.length === KEY_LEN);
  if (!passend) {
    throw new TokenCryptoError(
      `AMAZON_TOKEN_ENCRYPTION_KEY hat die falsche Länge (erwartet ${KEY_LEN} Byte als base64 oder hex).`,
    );
  }
  return passend;
}

/** Klartext-Refresh-Token → Chiffrat für die Spalte `encrypted_refresh_token`. */
export function verschluessele(klartext: string): string {
  if (!klartext) throw new TokenCryptoError("Leerer Token kann nicht verschlüsselt werden.");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", schluessel(), iv);
  const ciphertext = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

/**
 * Chiffrat → Klartext. Wirft bei falschem Schlüssel, Manipulation oder
 * unbekannter Version. Der Rückgabewert darf NIE in ein Log, eine Antwort oder
 * einen Audit-Eintrag wandern.
 */
export function entschluessele(gespeichert: string): string {
  const trenner = gespeichert.indexOf(":");
  if (trenner < 0) throw new TokenCryptoError("Chiffrat ohne Versionspräfix.");
  const version = gespeichert.slice(0, trenner);
  if (version !== VERSION) throw new TokenCryptoError(`Unbekannte Chiffrat-Version „${version}".`);

  const roh = Buffer.from(gespeichert.slice(trenner + 1), "base64");
  if (roh.length <= IV_LEN + TAG_LEN) throw new TokenCryptoError("Chiffrat zu kurz.");

  const iv = roh.subarray(0, IV_LEN);
  const tag = roh.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = roh.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv("aes-256-gcm", schluessel(), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Bewusst ohne Original-Fehlertext: der kann Implementierungsdetails
    // verraten, und die Ursache ist immer dieselbe Handvoll Fälle.
    throw new TokenCryptoError(
      "Refresh Token konnte nicht entschlüsselt werden (falscher Schlüssel oder veränderte Daten). Verbindung muss neu autorisiert werden.",
    );
  }
}

/**
 * Fingerprint des KLARTEXT-Tokens (SHA-256, hex). Zweck: erkennen, ob Amazon bei
 * einer Neu-Autorisierung denselben Token wie vorher geliefert hat — ohne
 * entschlüsseln zu müssen. Der Hash ist für einen Angreifer nutzlos, weil
 * Refresh Tokens hochentropisch sind.
 */
export function fingerprint(klartext: string): string {
  return createHash("sha256").update(klartext, "utf8").digest("hex");
}

/** Fingerprint-Vergleich in konstanter Zeit. */
export function fingerprintGleich(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Ist ein Schlüssel gesetzt und brauchbar? Für Health-Checks und die Oberfläche. */
export function schluesselVorhanden(): boolean {
  try {
    schluessel();
    return true;
  } catch {
    return false;
  }
}
