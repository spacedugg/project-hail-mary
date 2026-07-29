import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * Tests der Amazon-Aufrufkette (D263) — mit eingespeistem `fetch`, also ohne
 * Netz und ohne Amazon-Zugangsdaten. Geprüft wird das, was im Betrieb wehtut:
 *
 * - Wird der Access Token gecacht statt bei jedem Aufruf neu geholt?
 * - Wird bei Drosselung wiederholt und bei `invalid_grant` NICHT?
 * - Landet der Refresh Token oder Access Token irgendwo, wo er nicht hingehört?
 * - Hält der Daten-Kontrakt (D183), wenn Amazon Müll liefert?
 */

beforeAll(() => {
  process.env.DB_DRIVER = "pglite";
  process.env.AMAZON_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.AMAZON_LWA_CLIENT_ID = "amzn1.application-oa2-client.test";
  process.env.AMAZON_LWA_CLIENT_SECRET = "geheimes-app-secret";
  process.env.APP_URL = "https://tool.example.de";
});

const REFRESH = "Atzr|RefreshTokenTest";

/** Aufgezeichneter Aufruf — inklusive Body, damit wir auf Lecks prüfen können. */
type Aufzeichnung = { url: string; body: string; headers: Record<string, string> };

/**
 * Baut ein fetch-Double mit vorgegebenen Antworten je URL-Muster.
 * `lwa` beantwortet den Token-Endpunkt, `spApi` alles andere.
 */
function fetchDouble(opts: {
  lwa?: () => { status: number; body: unknown };
  spApi?: (n: number) => { status: number; body: unknown; headers?: Record<string, string> };
}) {
  const aufrufe: Aufzeichnung[] = [];
  let lwaAnzahl = 0;
  let spAnzahl = 0;

  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    aufrufe.push({
      url,
      body: typeof init?.body === "string" ? init.body : "",
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    if (url.includes("api.amazon.com/auth/o2/token")) {
      lwaAnzahl++;
      const a = opts.lwa?.() ?? { status: 200, body: { access_token: `AT-${lwaAnzahl}`, expires_in: 3600 } };
      return new Response(JSON.stringify(a.body), {
        status: a.status,
        headers: { "content-type": "application/json" },
      });
    }

    spAnzahl++;
    const a = opts.spApi?.(spAnzahl) ?? { status: 200, body: { payload: [] } };
    return new Response(JSON.stringify(a.body), {
      status: a.status,
      headers: { "content-type": "application/json", ...(a.headers ?? {}) },
    });
  }) as typeof fetch;

  return {
    impl,
    aufrufe,
    lwaAnzahl: () => lwaAnzahl,
    spAnzahl: () => spAnzahl,
  };
}

let zaehler = 0;
async function aktiveVerbindung() {
  const { getDb, schema } = await import("@/db/client");
  const { verschluessele, fingerprint } = await import("./auth/tokenCrypto");
  const db = await getDb();
  const s = `s${++zaehler}`;

  await db.insert(schema.clients).values({ id: `k-${s}`, name: `K ${s}`, slug: `k-${s}` });
  await db.insert(schema.users).values({
    id: `u-${s}`,
    email: `${s}@temoa.de`,
    name: "M",
    passwordHash: "x:y",
  });
  const [v] = await db
    .insert(schema.amazonConnections)
    .values({
      id: crypto.randomUUID(),
      clientId: `k-${s}`,
      region: "eu",
      status: "active",
      sellingPartnerId: `A1SELLER${s}`,
      encryptedRefreshToken: verschluessele(REFRESH),
      tokenFingerprint: fingerprint(REFRESH),
      authorizedAt: new Date(),
    })
    .returning();

  return { db, schema, clientId: `k-${s}`, userId: `u-${s}`, connectionId: v.id };
}

beforeEach(async () => {
  const { leereAccessTokenCache } = await import("./auth/accessToken");
  leereAccessTokenCache();
  delete process.env.AMAZON_SP_API_ENV;
});

describe("SP-API-Aufrufkette", () => {
  it("ruft Sandbox-Endpunkt auf, schickt den Access Token im Header — nie den Refresh Token", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({});
    const { spApiAufruf } = await import("./clients/spApiClient");

    const antwort = await spApiAufruf(
      { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
      { fetchImpl: doppel.impl, warte: async () => {} },
    );
    expect(antwort.daten).toEqual({ payload: [] });

    const spAufruf = doppel.aufrufe.find((a) => a.url.includes("sellingpartnerapi"));
    expect(spAufruf?.url).toBe(
      "https://sandbox.sellingpartnerapi-eu.amazon.com/sellers/v1/marketplaceParticipations",
    );
    expect(spAufruf?.headers["x-amz-access-token"]).toBe("AT-1");

    // Der Refresh Token geht ausschließlich an LWA, niemals an die SP-API.
    expect(spAufruf?.body).not.toContain(REFRESH);
    expect(JSON.stringify(spAufruf?.headers)).not.toContain(REFRESH);
    const lwaAufruf = doppel.aufrufe.find((a) => a.url.includes("o2/token"));
    expect(lwaAufruf?.body).toContain(encodeURIComponent(REFRESH));
  });

  it("cacht den Access Token: zwei Aufrufe, aber nur ein LWA-Austausch", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({});
    const { spApiAufruf } = await import("./clients/spApiClient");

    const aufruf = () =>
      spApiAufruf(
        { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
        { fetchImpl: doppel.impl, warte: async () => {} },
      );
    await aufruf();
    await aufruf();

    expect(doppel.spAnzahl()).toBe(2);
    expect(doppel.lwaAnzahl()).toBe(1);
  });

  it("holt bei kurzer Restlaufzeit einen frischen Token (Sicherheitsabstand greift)", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    // expires_in unter dem Sicherheitsabstand → nie cachen.
    const doppel = fetchDouble({ lwa: () => ({ status: 200, body: { access_token: "AT", expires_in: 30 } }) });
    const { spApiAufruf } = await import("./clients/spApiClient");

    const aufruf = () =>
      spApiAufruf(
        { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
        { fetchImpl: doppel.impl, warte: async () => {} },
      );
    await aufruf();
    await aufruf();

    expect(doppel.lwaAnzahl()).toBe(2);
  });

  it("wiederholt bei Drosselung (429) und liefert dann das Ergebnis", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({
      spApi: (n) =>
        n === 1
          ? { status: 429, body: { errors: [{ code: "QuotaExceeded" }] } }
          : { status: 200, body: { payload: [] }, headers: { "x-amzn-RequestId": "req-ok" } },
    });
    const { spApiAufruf } = await import("./clients/spApiClient");

    const antwort = await spApiAufruf(
      { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
      { fetchImpl: doppel.impl, warte: async () => {} },
    );
    expect(doppel.spAnzahl()).toBe(2);
    expect(antwort.amazonRequestId).toBe("req-ok");
  });

  it("gibt bei dauerhafter Drosselung nach 3 Versuchen auf — keine Endlosschleife", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({ spApi: () => ({ status: 429, body: {} }) });
    const { spApiAufruf, SpApiFehler } = await import("./clients/spApiClient");

    await expect(
      spApiAufruf(
        { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
        { fetchImpl: doppel.impl, warte: async () => {} },
      ),
    ).rejects.toThrow(SpApiFehler);
    expect(doppel.spAnzahl()).toBe(3);
  });

  it("wiederholt bei invalid_grant NICHT und setzt die Verbindung auf Neu-Autorisierung", async () => {
    const { db, schema, clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({
      lwa: () => ({ status: 400, body: { error: "invalid_grant" } }),
    });
    const { spApiAufruf } = await import("./clients/spApiClient");

    await expect(
      spApiAufruf(
        { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
        { fetchImpl: doppel.impl, warte: async () => {} },
      ),
    ).rejects.toThrow();

    // Genau EIN LWA-Versuch, kein einziger SP-API-Aufruf.
    expect(doppel.lwaAnzahl()).toBe(1);
    expect(doppel.spAnzahl()).toBe(0);

    // Und der Zustand ist so gesetzt, dass das Tool nicht weiterprobiert.
    const zeile = await db.query.amazonConnections.findFirst({
      where: eq(schema.amazonConnections.id, connectionId),
    });
    expect(zeile?.status).toBe("reauthorization_required");

    const repo = await import("./repositories/verbindungen");
    await expect(repo.holeRefreshTokenFuerAufruf(clientId, connectionId)).rejects.toThrow(
      /erneut autorisiert/,
    );
  });

  it("verwirft nach 401 den gecachten Token und versucht genau einmal neu", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({
      spApi: (n) => (n === 1 ? { status: 401, body: {} } : { status: 200, body: { payload: [] } }),
    });
    const { spApiAufruf } = await import("./clients/spApiClient");

    await spApiAufruf(
      { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
      { fetchImpl: doppel.impl, warte: async () => {} },
    );
    expect(doppel.spAnzahl()).toBe(2);
    // Zweiter Versuch mit FRISCHEM Token, nicht mit dem abgelehnten.
    expect(doppel.lwaAnzahl()).toBe(2);
  });

  it("weist einen Marktplatz ab, der nicht zur Region der Verbindung gehört", async () => {
    const { clientId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({});
    const { spApiAufruf } = await import("./clients/spApiClient");

    await expect(
      spApiAufruf(
        { clientId, connectionId, pfad: "/x", marktplatz: "us" },
        { fetchImpl: doppel.impl, warte: async () => {} },
      ),
    ).rejects.toThrow(/gehört nicht zur Region/);
    // Kein Token geholt, kein Aufruf gemacht — die Prüfung greift davor.
    expect(doppel.lwaAnzahl()).toBe(0);
    expect(doppel.spAnzahl()).toBe(0);
  });

  it("produktive Umgebung trifft den Produktions-Endpunkt", async () => {
    process.env.AMAZON_SP_API_ENV = "production";
    try {
      const { clientId, connectionId } = await aktiveVerbindung();
      const doppel = fetchDouble({});
      const { spApiAufruf } = await import("./clients/spApiClient");
      await spApiAufruf(
        { clientId, connectionId, pfad: "/sellers/v1/marketplaceParticipations" },
        { fetchImpl: doppel.impl, warte: async () => {} },
      );
      expect(doppel.aufrufe.find((a) => a.url.includes("sellingpartnerapi"))?.url).toContain(
        "https://sellingpartnerapi-eu.amazon.com/",
      );
    } finally {
      delete process.env.AMAZON_SP_API_ENV;
    }
  });

  it("Code-Tausch: liefert den Refresh Token und schickt die registrierte Redirect-URI", async () => {
    const doppel = fetchDouble({
      lwa: () => ({ status: 200, body: { refresh_token: REFRESH, access_token: "AT", expires_in: 3600 } }),
    });
    const { tauscheAuthorizationCode } = await import("./auth/accessToken");

    const { refreshToken } = await tauscheAuthorizationCode("ANCode123", doppel.impl);
    expect(refreshToken).toBe(REFRESH);

    const body = doppel.aufrufe[0].body;
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=ANCode123");
    expect(body).toContain(encodeURIComponent("https://tool.example.de/api/amazon/callback"));
  });

  it("Code-Tausch ohne Refresh Token in der Antwort scheitert klar", async () => {
    const doppel = fetchDouble({ lwa: () => ({ status: 200, body: { access_token: "AT" } }) });
    const { tauscheAuthorizationCode } = await import("./auth/accessToken");
    await expect(tauscheAuthorizationCode("X", doppel.impl)).rejects.toThrow(/keinen Refresh Token/);
  });
});

describe("Daten-Kontrakt der Marktplatz-Teilnahmen (D183)", () => {
  it("normalisiert eine echte Antwortform", async () => {
    const { normalisiereTeilnahmen } = await import("./operations/marketplaceParticipations");
    const { teilnahmen, verworfen } = normalisiereTeilnahmen({
      payload: [
        {
          marketplace: {
            id: "A1PA6795UKMFR9",
            countryCode: "DE",
            name: "Amazon.de",
            defaultCurrencyCode: "EUR",
            defaultLanguageCode: "de_DE",
          },
          participation: { isParticipating: true, hasSuspendedListings: false },
        },
      ],
    });
    expect(verworfen).toBe(0);
    expect(teilnahmen[0]).toEqual({
      marketplaceId: "A1PA6795UKMFR9",
      countryCode: "DE",
      name: "Amazon.de",
      defaultCurrency: "EUR",
      defaultLanguage: "de_DE",
      isParticipating: true,
      hasSuspendedListings: false,
    });
  });

  it("verwirft unvollständige Einträge statt halbe Zeilen zu schreiben — und zählt sie", async () => {
    const { normalisiereTeilnahmen } = await import("./operations/marketplaceParticipations");
    const { teilnahmen, verworfen } = normalisiereTeilnahmen({
      payload: [
        { marketplace: { countryCode: "DE" } }, // keine ID
        { marketplace: { id: "A1" } }, // kein Ländercode
        { marketplace: { id: "A2", countryCode: "FR" } }, // ok, ohne Namen
      ],
    });
    expect(verworfen).toBe(2);
    expect(teilnahmen).toHaveLength(1);
    // Kein geratener Name — der Ländercode springt ein (D114/D115).
    expect(teilnahmen[0].name).toBe("FR");
    expect(teilnahmen[0].defaultCurrency).toBeNull();
    expect(teilnahmen[0].isParticipating).toBe(false);
  });

  it("übersteht Unsinn ohne zu werfen", async () => {
    const { normalisiereTeilnahmen } = await import("./operations/marketplaceParticipations");
    for (const müll of [null, undefined, {}, { payload: null }, { payload: "text" }, []]) {
      expect(normalisiereTeilnahmen(müll)).toEqual({ teilnahmen: [], verworfen: 0 });
    }
  });

  it("speichert, aktualisiert ohne Dubletten und protokolliert den Sync", async () => {
    const { db, schema, clientId, userId, connectionId } = await aktiveVerbindung();
    const { saveMarketplaceParticipations, ladeMarktplaetze } = await import(
      "./operations/marketplaceParticipations"
    );

    const de = {
      marketplaceId: "A1PA6795UKMFR9",
      countryCode: "DE",
      name: "Amazon.de",
      defaultCurrency: "EUR",
      defaultLanguage: "de_DE",
      isParticipating: true,
      hasSuspendedListings: false,
    };

    await saveMarketplaceParticipations({ clientId, connectionId, teilnahmen: [de], userId });
    expect(await ladeMarktplaetze(connectionId)).toHaveLength(1);

    // Zweiter Sync mit geändertem Zustand: aktualisiert, keine zweite Zeile.
    await saveMarketplaceParticipations({
      clientId,
      connectionId,
      teilnahmen: [{ ...de, hasSuspendedListings: true }],
      userId,
      amazonRequestId: "req-2",
    });
    const gespeichert = await ladeMarktplaetze(connectionId);
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].hasSuspendedListings).toBe(true);
    expect(gespeichert[0].lastSyncedAt).toBeInstanceOf(Date);

    // Und der Sync steht im Audit-Log, mit Request-ID.
    const logs = await db.query.auditLogs.findMany({
      where: eq(schema.auditLogs.connectionId, connectionId),
    });
    expect(logs).toHaveLength(2);
    expect(logs.some((l) => l.amazonRequestId === "req-2")).toBe(true);
    expect(logs[0].action).toBe("amazon.marketplaces.synced");
  });

  it("Ende-zu-Ende: Abruf → Normalisierung → Persistenz, ohne Token-Leck im Audit", async () => {
    const { db, schema, clientId, userId, connectionId } = await aktiveVerbindung();
    const doppel = fetchDouble({
      spApi: () => ({
        status: 200,
        headers: { "x-amzn-RequestId": "req-e2e" },
        body: {
          payload: [
            {
              marketplace: { id: "A1PA6795UKMFR9", countryCode: "DE", name: "Amazon.de" },
              participation: { isParticipating: true, hasSuspendedListings: false },
            },
            { marketplace: { countryCode: "XX" } },
          ],
        },
      }),
    });
    const { getMarketplaceParticipations, saveMarketplaceParticipations } = await import(
      "./operations/marketplaceParticipations"
    );

    const ergebnis = await getMarketplaceParticipations(
      { clientId, connectionId },
      { fetchImpl: doppel.impl, warte: async () => {} },
    );
    expect(ergebnis.teilnahmen).toHaveLength(1);
    expect(ergebnis.verworfen).toBe(1);
    expect(ergebnis.amazonRequestId).toBe("req-e2e");

    await saveMarketplaceParticipations({
      clientId,
      connectionId,
      teilnahmen: ergebnis.teilnahmen,
      userId,
      amazonRequestId: ergebnis.amazonRequestId,
    });

    const logs = await db.query.auditLogs.findMany({
      where: eq(schema.auditLogs.connectionId, connectionId),
    });
    const text = JSON.stringify(logs);
    expect(text).not.toContain("Atzr");
    expect(text).not.toContain("AT-1");
    expect(text).not.toContain("geheimes-app-secret");
  });
});
