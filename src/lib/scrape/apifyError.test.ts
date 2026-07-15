import { describe, expect, it } from "vitest";
import { friendlyApifyError } from "./apifyError";

describe("friendlyApifyError — verständliche Meldungen statt Roh-JSON", () => {
  it("übersetzt die Actor-Freigabe (403) und extrahiert den Freigabe-Link", () => {
    const body = JSON.stringify({
      error: {
        type: "full-permission-actor-not-approved",
        message:
          "This Actor requires full access to your account. You must approve its permissions before running it: https://console.apify.com/actors/7KgyOHHEiPEcilZXM?approvePermission",
      },
    });
    const msg = friendlyApifyError(403, body, "axesso_data~amazon-product-details-scraper");
    expect(msg).toContain("einmalig deine Freigabe");
    expect(msg).toContain("https://console.apify.com/actors/7KgyOHHEiPEcilZXM?approvePermission");
    expect(msg).not.toContain('"error"');
  });

  it("401 → Key-Hinweis", () => {
    expect(friendlyApifyError(401, "{}", "a")).toContain("APIFY_API_KEY");
  });

  it("unbekannter Fehler bleibt informativ (Status + Actor + Meldung)", () => {
    const msg = friendlyApifyError(500, JSON.stringify({ error: { type: "internal", message: "boom" } }), "actor-x");
    expect(msg).toContain("500");
    expect(msg).toContain("actor-x");
    expect(msg).toContain("boom");
  });

  it("kaputtes JSON crasht nicht", () => {
    expect(friendlyApifyError(502, "<html>Bad Gateway</html>", "a")).toContain("502");
  });
});
