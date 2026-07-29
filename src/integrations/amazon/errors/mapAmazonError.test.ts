import { describe, it, expect } from "vitest";
import { mapAmazonError } from "./mapAmazonError";

/**
 * Der Fehler-Mapper ist die Stelle, die entscheidet, ob das Tool erneut
 * versucht, aufgibt oder den Kunden um Neu-Autorisierung bittet. Die Tests
 * sichern genau diese Entscheidungen ab — und dass keine Amazon-Rohtexte
 * nach außen durchsickern.
 */

describe("mapAmazonError", () => {
  it("invalid_grant → Neu-Autorisierung, KEIN Retry (Endlosschleifen-Schutz)", () => {
    const f = mapAmazonError({ httpStatus: 400, body: { error: "invalid_grant" } });
    expect(f.code).toBe("auth_ungueltig");
    expect(f.wiederholbar).toBe(false);
    expect(f.folgeStatus).toBe("reauthorization_required");
  });

  it("LWA-Code gewinnt vor dem HTTP-Status — 400 ist hier kein Eingabefehler", () => {
    expect(mapAmazonError({ httpStatus: 400, body: { error: "invalid_grant" } }).code).toBe("auth_ungueltig");
    expect(mapAmazonError({ httpStatus: 400, body: { message: "irgendwas" } }).code).toBe("eingabe_fehlerhaft");
  });

  it("invalid_client → Konfigurationsfehler bei UNS, nicht beim Kunden", () => {
    const f = mapAmazonError({ httpStatus: 401, body: { error: "invalid_client" } });
    expect(f.code).toBe("app_konfiguration");
    expect(f.folgeStatus).toBeNull();
    expect(f.meldung).toMatch(/keine Aktion beim Kunden/);
  });

  it("429 und 5xx sind wiederholbar, 403 und 404 nicht", () => {
    expect(mapAmazonError({ httpStatus: 429 }).wiederholbar).toBe(true);
    expect(mapAmazonError({ httpStatus: 503 }).wiederholbar).toBe(true);
    expect(mapAmazonError({ httpStatus: 403 }).wiederholbar).toBe(false);
    expect(mapAmazonError({ httpStatus: 404 }).wiederholbar).toBe(false);
  });

  it("Drosselung ändert den Verbindungsstatus NICHT", () => {
    expect(mapAmazonError({ httpStatus: 429 }).folgeStatus).toBeNull();
  });

  it("Netzwerkfehler ohne HTTP-Antwort ist wiederholbar", () => {
    const f = mapAmazonError({ netzwerkFehler: new Error("ETIMEDOUT") });
    expect(f.code).toBe("amazon_nicht_erreichbar");
    expect(f.wiederholbar).toBe(true);
  });

  it("liest die Amazon-Request-ID aus Headers (beide Schreibweisen)", () => {
    const h = new Headers({ "x-amzn-RequestId": "abc-123" });
    expect(mapAmazonError({ httpStatus: 500, headers: h }).amazonRequestId).toBe("abc-123");
    expect(
      mapAmazonError({ httpStatus: 500, headers: { "x-amzn-requestid": "def-456" } }).amazonRequestId,
    ).toBe("def-456");
    expect(mapAmazonError({ httpStatus: 500 }).amazonRequestId).toBeNull();
  });

  it("gibt niemals Amazon-Rohtext in der Nutzer-Meldung weiter", () => {
    const geheim = "SellerId=A1B2C3 refresh_token=Atzr|GEHEIM";
    const f = mapAmazonError({
      httpStatus: 400,
      body: { errors: [{ message: geheim, details: geheim }] },
    });
    expect(f.meldung).not.toContain("Atzr");
    expect(f.meldung).not.toContain("A1B2C3");
    expect(f.meldung).not.toContain(geheim);
  });

  it("liefert für jeden Eingang einen Code — nie undefined", () => {
    for (const status of [200, 302, 400, 401, 403, 404, 418, 429, 500, 502, 503]) {
      const f = mapAmazonError({ httpStatus: status });
      expect(f.code).toBeTruthy();
      expect(f.meldung.length).toBeGreaterThan(10);
    }
    expect(mapAmazonError({}).code).toBe("unbekannt");
  });
});
