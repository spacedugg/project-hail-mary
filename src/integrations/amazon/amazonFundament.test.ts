import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * Integrationstest des Amazon-Fundaments gegen echtes Postgres (PGlite, D262).
 *
 * Zwei Dinge werden hier bewiesen, die man nicht im Kopf beweisen kann:
 * 1. **Mandantentrennung** — Kunde B kommt an nichts von Kunde A, auch nicht mit
 *    korrekter connectionId. Weil wir bewusst KEIN RLS einsetzen (D262: bei einer
 *    Direktverbindung als Eigentümer wäre es wirkungslos), ist dieser Test der
 *    einzige Wächter über die Trennung — entsprechend explizit.
 * 2. **OAuth-State ist einmalig** — bei zwei gleichzeitigen Callbacks gewinnt
 *    genau einer. Das entscheidet das bedingte UPDATE in der Datenbank.
 */

beforeAll(() => {
  process.env.DB_DRIVER = "pglite";
  process.env.AMAZON_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const TOKEN = "Atzr|RefreshTokenBeispiel";

/**
 * Jeder Test bekommt einen eigenen Mandanten. PGlite ist pro Testdatei EINE
 * gemeinsame Datenbank — feste IDs würden sich zwischen Tests in die Quere kommen
 * und die Testreihenfolge zur versteckten Voraussetzung machen.
 */
let zaehler = 0;
async function neuerMandant() {
  const { getDb, schema } = await import("@/db/client");
  const db = await getDb();
  const s = `t${++zaehler}`;
  await db.insert(schema.clients).values({ id: `kunde-${s}`, name: `Kunde ${s}`, slug: `kunde-${s}` });
  await db.insert(schema.brands).values({ id: `marke-${s}`, clientId: `kunde-${s}`, name: `Marke ${s}` });
  await db.insert(schema.users).values({
    id: `user-${s}`,
    email: `${s}@temoa.de`,
    name: "Mitarbeiter",
    passwordHash: "x:y",
  });
  return { db, schema, clientId: `kunde-${s}`, brandId: `marke-${s}`, userId: `user-${s}` };
}

describe("Amazon-Fundament (Postgres via PGlite)", () => {
  it("trennt Mandanten: der fremde Kunde erreicht die Verbindung nicht", async () => {
    const a = await neuerMandant();
    const b = await neuerMandant();
    const repo = await import("./repositories/verbindungen");

    const verbindungA = await repo.erstelleVerbindung({ clientId: a.clientId, label: "Seller DE" });

    // Eigener Kunde: geht.
    await expect(repo.ladeVerbindung(a.clientId, verbindungA.id)).resolves.toMatchObject({
      id: verbindungA.id,
      clientId: a.clientId,
    });

    // Fremder Kunde mit der KORREKTEN ID: geht nicht — und die Meldung verrät
    // nicht, dass die ID existiert.
    await expect(repo.ladeVerbindung(b.clientId, verbindungA.id)).rejects.toThrow(/existiert nicht/);

    // Auch der Token-Pfad ist für den fremden Mandanten dicht.
    await expect(repo.holeRefreshTokenFuerAufruf(b.clientId, verbindungA.id)).rejects.toThrow(
      /existiert nicht/,
    );

    // Und die Liste des fremden Kunden ist leer, nicht „alles".
    await expect(repo.listeVerbindungen(b.clientId)).resolves.toEqual([]);
    await expect(repo.listeVerbindungen(a.clientId)).resolves.toHaveLength(1);
  });

  it("gibt den Refresh Token nie in der öffentlichen Sicht aus", async () => {
    const { db, schema, clientId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");
    const { verschluessele, fingerprint } = await import("./auth/tokenCrypto");

    const v = await repo.erstelleVerbindung({ clientId });
    await db
      .update(schema.amazonConnections)
      .set({
        status: "active",
        sellingPartnerId: "A1SELLER",
        encryptedRefreshToken: verschluessele(TOKEN),
        tokenFingerprint: fingerprint(TOKEN),
        authorizedAt: new Date(),
      })
      .where(eq(schema.amazonConnections.id, v.id));

    const sicht = await repo.ladeVerbindung(clientId, v.id);
    const serialisiert = JSON.stringify(sicht);
    expect(serialisiert).not.toContain("Atzr");
    expect(serialisiert).not.toContain(fingerprint(TOKEN));
    expect(sicht.hatToken).toBe(true);
    expect(sicht.sellingPartnerId).toBe("A1SELLER");

    // Serverseitig ist der Token dagegen nutzbar.
    const { refreshToken } = await repo.holeRefreshTokenFuerAufruf(clientId, v.id);
    expect(refreshToken).toBe(TOKEN);
  });

  it("nach dem Trennen ist kein Amazon-Aufruf mehr möglich und der Token ist weg", async () => {
    const { db, schema, clientId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");
    const { verschluessele } = await import("./auth/tokenCrypto");

    const v = await repo.erstelleVerbindung({ clientId });
    await db
      .update(schema.amazonConnections)
      .set({ status: "active", encryptedRefreshToken: verschluessele(TOKEN) })
      .where(eq(schema.amazonConnections.id, v.id));

    await expect(repo.holeRefreshTokenFuerAufruf(clientId, v.id)).resolves.toBeTruthy();

    const getrennt = await repo.trenneVerbindung(clientId, v.id);
    expect(getrennt.status).toBe("disconnected");
    expect(getrennt.hatToken).toBe(false);
    expect(getrennt.revokedAt).toBeInstanceOf(Date);

    // Der Token ist in der DATENBANK gelöscht, nicht nur ausgeblendet.
    const zeile = await db.query.amazonConnections.findFirst({
      where: eq(schema.amazonConnections.id, v.id),
    });
    expect(zeile?.encryptedRefreshToken).toBeNull();
    expect(zeile?.tokenFingerprint).toBeNull();

    // Und jeder weitere Aufruf ist Endstation — keine stille Reaktivierung.
    await expect(repo.holeRefreshTokenFuerAufruf(clientId, v.id)).rejects.toThrow(/getrennt/);
  });

  it("sperrt Aufrufe bei pending und reauthorization_required", async () => {
    const { db, schema, clientId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");

    const v = await repo.erstelleVerbindung({ clientId });
    await expect(repo.holeRefreshTokenFuerAufruf(clientId, v.id)).rejects.toThrow(
      /noch nicht autorisiert/,
    );

    await db
      .update(schema.amazonConnections)
      .set({ status: "reauthorization_required" })
      .where(eq(schema.amazonConnections.id, v.id));
    await expect(repo.holeRefreshTokenFuerAufruf(clientId, v.id)).rejects.toThrow(
      /erneut autorisiert/,
    );
  });

  it("vermerkt Erfolg und Fehler — ein Erfolg hebt einen vorherigen Fehler auf", async () => {
    const { db, schema, clientId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");
    const { mapAmazonError } = await import("./errors/mapAmazonError");

    const v = await repo.erstelleVerbindung({ clientId });
    await db
      .update(schema.amazonConnections)
      .set({ status: "active" })
      .where(eq(schema.amazonConnections.id, v.id));

    // Drosselung: Zeitstempel ja, Statuswechsel nein.
    await repo.vermerkeFehler(clientId, v.id, mapAmazonError({ httpStatus: 429 }));
    let sicht = await repo.ladeVerbindung(clientId, v.id);
    expect(sicht.status).toBe("active");
    expect(sicht.lastErrorCode).toBe("gedrosselt");

    // Entwerteter Token: Statuswechsel zur Neu-Autorisierung.
    await repo.vermerkeFehler(
      clientId,
      v.id,
      mapAmazonError({ httpStatus: 400, body: { error: "invalid_grant" } }),
    );
    sicht = await repo.ladeVerbindung(clientId, v.id);
    expect(sicht.status).toBe("reauthorization_required");

    // Erfolg räumt auf.
    await repo.vermerkeErfolg(clientId, v.id);
    sicht = await repo.ladeVerbindung(clientId, v.id);
    expect(sicht.status).toBe("active");
    expect(sicht.lastErrorCode).toBeNull();
    expect(sicht.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("OAuth-State: einmalig — der zweite Callback verliert", async () => {
    const { clientId, userId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");
    const { erzeugeState, verbraucheState } = await import("./auth/oauthState");

    const v = await repo.erstelleVerbindung({ clientId });
    const state = await erzeugeState({ userId, clientId, connectionId: v.id });

    expect(await verbraucheState(state)).toEqual({
      ok: true,
      bindung: { userId, clientId, connectionId: v.id },
    });
    expect(await verbraucheState(state)).toEqual({ ok: false, grund: "bereits_verwendet" });
  });

  it("OAuth-State: unbekannter Wert wird abgewiesen (CSRF)", async () => {
    const { verbraucheState } = await import("./auth/oauthState");
    await expect(verbraucheState("frei-erfunden")).resolves.toEqual({ ok: false, grund: "unbekannt" });
  });

  it("OAuth-State: abgelaufen wird abgewiesen und aufgeräumt", async () => {
    const { db, schema, clientId, userId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");
    const { erzeugeState, verbraucheState, raeumeAbgelaufeneStates } = await import("./auth/oauthState");

    const v = await repo.erstelleVerbindung({ clientId });
    const state = await erzeugeState({ userId, clientId, connectionId: v.id });

    // Frist künstlich in die Vergangenheit ziehen.
    await db
      .update(schema.amazonOauthStates)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.amazonOauthStates.connectionId, v.id));

    expect(await verbraucheState(state)).toEqual({ ok: false, grund: "abgelaufen" });
    expect(await raeumeAbgelaufeneStates()).toBeGreaterThanOrEqual(1);
  });

  it("OAuth-State: der Klartext-Wert steht NICHT in der Datenbank", async () => {
    const { db, schema, clientId, userId } = await neuerMandant();
    const repo = await import("./repositories/verbindungen");
    const { erzeugeState } = await import("./auth/oauthState");

    const v = await repo.erstelleVerbindung({ clientId });
    const state = await erzeugeState({ userId, clientId, connectionId: v.id });

    const zeile = await db.query.amazonOauthStates.findFirst({
      where: eq(schema.amazonOauthStates.connectionId, v.id),
    });
    expect(zeile).toBeTruthy();
    expect(zeile?.stateHash).not.toBe(state);
    expect(JSON.stringify(zeile)).not.toContain(state);
  });

  it("Audit-Log filtert Tokens und Secrets heraus, statt sich auf Disziplin zu verlassen", async () => {
    const { db, schema, clientId, userId } = await neuerMandant();
    const { schreibeAuditLog, entferneGeheimnisse } = await import("./audit");

    await schreibeAuditLog({
      action: "amazon.connection.authorized",
      entityType: "amazon_connection",
      clientId,
      userId,
      nachher: {
        sellingPartnerId: "A1SELLER",
        refresh_token: TOKEN,
        verschachtelt: { clientSecret: "streng-geheim", token: TOKEN, harmlos: "sichtbar" },
      },
      amazonRequestId: "req-1",
    });

    const zeile = await db.query.auditLogs.findFirst({
      where: eq(schema.auditLogs.clientId, clientId),
    });
    const text = JSON.stringify(zeile);
    expect(text).not.toContain("Atzr");
    expect(text).not.toContain("streng-geheim");
    expect(text).toContain("A1SELLER");
    expect(text).toContain("sichtbar");
    expect(zeile?.amazonRequestId).toBe("req-1");

    // Die Filterung ist rekursiv, nicht nur auf der obersten Ebene.
    const gefiltert = entferneGeheimnisse({ a: { b: { access_token: "x" } } }) as {
      a: { b: { access_token: string } };
    };
    expect(gefiltert.a.b.access_token).toBe("[entfernt]");
  });

  it("Regionen: Marktplatz-Region-Prüfung verhindert Aufrufe gegen den falschen Endpunkt", async () => {
    const { marktplatzPasstZuRegion, regionVonMarktplatz, spApiBasis, umgebung, consentUrl } =
      await import("./regionen");

    expect(regionVonMarktplatz("de")).toBe("eu");
    expect(regionVonMarktplatz("us")).toBe("na");
    expect(marktplatzPasstZuRegion("de", "eu")).toBe(true);
    expect(marktplatzPasstZuRegion("us", "eu")).toBe(false);

    // Default ist Sandbox — ein vergessener Schalter fasst nie echte Daten an.
    expect(umgebung()).toBe("sandbox");
    expect(spApiBasis("eu")).toBe("https://sandbox.sellingpartnerapi-eu.amazon.com");

    process.env.AMAZON_SP_API_ENV = "production";
    try {
      expect(spApiBasis("eu")).toBe("https://sellingpartnerapi-eu.amazon.com");
    } finally {
      delete process.env.AMAZON_SP_API_ENV;
    }

    // Consent-URL: richtiger Seller-Central-Host + version=beta im Draft-Status.
    const url = consentUrl({ applicationId: "amzn1.app.test", state: "S1", marktplatz: "de" });
    expect(url).toContain("https://sellercentral.amazon.de/apps/authorize/consent");
    expect(url).toContain("application_id=amzn1.app.test");
    expect(url).toContain("state=S1");
    expect(url).toContain("version=beta");
    expect(consentUrl({ applicationId: "a", state: "s", marktplatz: "uk" })).toContain(
      "sellercentral.amazon.co.uk",
    );

    // Veröffentlichte App: kein version=beta mehr.
    process.env.AMAZON_SP_API_APP_PUBLISHED = "true";
    try {
      expect(consentUrl({ applicationId: "a", state: "s", marktplatz: "de" })).not.toContain("version=beta");
    } finally {
      delete process.env.AMAZON_SP_API_APP_PUBLISHED;
    }
  });
});
