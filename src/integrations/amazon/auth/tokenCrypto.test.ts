import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import {
  entschluessele,
  fingerprint,
  fingerprintGleich,
  schluesselVorhanden,
  TokenCryptoError,
  verschluessele,
} from "./tokenCrypto";

/**
 * Der Refresh Token ist das einzige echte Geheimnis eines Kunden in unserem
 * System. Diese Tests prüfen deshalb nicht nur „rein = raus", sondern vor allem
 * die Fälle, in denen etwas SCHIEFGEHEN muss: falscher Schlüssel, manipuliertes
 * Chiffrat, fehlende Konfiguration.
 */

const ORIGINAL = process.env.AMAZON_TOKEN_ENCRYPTION_KEY;
const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const TOKEN = "Atzr|IwEBIExampleRefreshTokenMitSonderzeichen-_äöü";

beforeAll(() => {
  process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_A;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.AMAZON_TOKEN_ENCRYPTION_KEY;
  else process.env.AMAZON_TOKEN_ENCRYPTION_KEY = ORIGINAL;
});

describe("tokenCrypto", () => {
  it("verschlüsselt und entschlüsselt verlustfrei, inkl. Sonderzeichen", () => {
    const chiffrat = verschluessele(TOKEN);
    expect(chiffrat.startsWith("v1:")).toBe(true);
    expect(entschluessele(chiffrat)).toBe(TOKEN);
  });

  it("enthält den Klartext nirgends im Chiffrat", () => {
    const chiffrat = verschluessele(TOKEN);
    expect(chiffrat).not.toContain("Atzr");
    expect(chiffrat).not.toContain(TOKEN);
  });

  it("erzeugt bei gleichem Klartext unterschiedliche Chiffrate (frischer IV)", () => {
    expect(verschluessele(TOKEN)).not.toBe(verschluessele(TOKEN));
  });

  it("scheitert mit dem falschen Schlüssel statt Müll zu liefern", () => {
    const chiffrat = verschluessele(TOKEN);
    process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_B;
    try {
      expect(() => entschluessele(chiffrat)).toThrow(TokenCryptoError);
    } finally {
      process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_A;
    }
  });

  it("erkennt ein manipuliertes Chiffrat (GCM-Auth-Tag greift)", () => {
    const chiffrat = verschluessele(TOKEN);
    const roh = Buffer.from(chiffrat.slice(3), "base64");
    roh[roh.length - 1] ^= 0xff; // letztes Byte kippen
    const manipuliert = `v1:${roh.toString("base64")}`;
    expect(() => entschluessele(manipuliert)).toThrow(TokenCryptoError);
  });

  it("weist unbekannte Versionspräfixe ab statt zu raten", () => {
    const chiffrat = verschluessele(TOKEN);
    expect(() => entschluessele(chiffrat.replace("v1:", "v2:"))).toThrow(/Version/);
    expect(() => entschluessele(chiffrat.slice(3))).toThrow(/Versionspräfix/);
  });

  it("scheitert hart ohne Schlüssel — kein Klartext-Fallback", () => {
    delete process.env.AMAZON_TOKEN_ENCRYPTION_KEY;
    try {
      expect(schluesselVorhanden()).toBe(false);
      expect(() => verschluessele(TOKEN)).toThrow(/AMAZON_TOKEN_ENCRYPTION_KEY fehlt/);
    } finally {
      process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_A;
    }
  });

  it("weist einen zu kurzen Schlüssel ab statt schwach zu verschlüsseln", () => {
    process.env.AMAZON_TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    try {
      expect(() => verschluessele(TOKEN)).toThrow(/falsche Länge/);
    } finally {
      process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_A;
    }
  });

  it("akzeptiert den Schlüssel als hex genauso wie als base64", () => {
    const hex = Buffer.from(KEY_A, "base64").toString("hex");
    const chiffrat = verschluessele(TOKEN);
    process.env.AMAZON_TOKEN_ENCRYPTION_KEY = hex;
    try {
      expect(entschluessele(chiffrat)).toBe(TOKEN);
    } finally {
      process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_A;
    }
  });

  it("nennt in Fehlermeldungen niemals den Schlüssel oder den Token", () => {
    process.env.AMAZON_TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    const kurz = process.env.AMAZON_TOKEN_ENCRYPTION_KEY;
    try {
      verschluessele(TOKEN);
      throw new Error("hätte werfen müssen");
    } catch (e) {
      const text = String((e as Error).message);
      expect(text).not.toContain(kurz);
      expect(text).not.toContain(TOKEN);
    } finally {
      process.env.AMAZON_TOKEN_ENCRYPTION_KEY = KEY_A;
    }
  });

  it("Fingerprint ist stabil, unterscheidet Tokens und ist nicht der Token", () => {
    const fp = fingerprint(TOKEN);
    expect(fp).toBe(fingerprint(TOKEN));
    expect(fp).not.toBe(fingerprint(`${TOKEN}x`));
    expect(fp).not.toContain("Atzr");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintGleich(fp, fingerprint(TOKEN))).toBe(true);
    expect(fingerprintGleich(fp, fingerprint("anders"))).toBe(false);
  });
});
