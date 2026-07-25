import { describe, it, expect } from "vitest";
import { buildListingsPatchRequest, buildListingsRequestMeta, type PublishInput } from "./listingsPayload";
import { pruefePublish, publishBereit, pruefeBildUrl } from "./publishGate";

const basis: PublishInput = {
  sku: "TEM-001",
  asin: "B0TEST1234",
  productType: "HOME_BED_AND_BATH",
  marketplace: "de",
  title: "Marke Bettwäsche 135x200 Baumwolle — atmungsaktiv, mit Reißverschluss",
  bullets: ["Bullet eins", "Bullet zwei", "Bullet drei", "Bullet vier", "Bullet fünf"],
  description: "Eine ausführliche Beschreibung.",
  backendKeywords: "bettwaesche baumwolle sommer",
  mainImageUrl: "https://cdn.example.com/haupt.jpg",
  galleryImageUrls: ["https://cdn.example.com/g1.jpg"],
};

describe("Listings-Payload (Kontrakt §3)", () => {
  it("verpackt jeden Textwert als Array mit marketplace_id UND language_tag", () => {
    const req = buildListingsPatchRequest(basis);
    const titel = req.patches.find((p) => p.path === "/attributes/item_name");
    expect(titel?.op).toBe("replace");
    expect(titel?.value).toEqual([
      { value: basis.title, marketplace_id: "A1PA6795UKMFR9", language_tag: "de_DE" },
    ]);
  });

  it("schickt bullet_point als EIN Array mit allen fünf Werten", () => {
    const req = buildListingsPatchRequest(basis);
    const bullets = req.patches.find((p) => p.path === "/attributes/bullet_point");
    expect((bullets?.value as unknown[]).length).toBe(5);
    // kein Einzel-Pfad wie /attributes/bullet_point/2 — den kennt die API nicht
    expect(req.patches.some((p) => /bullet_point\/\d/.test(p.path))).toBe(false);
  });

  it("gibt Bild-Locatoren OHNE language_tag aus", () => {
    const req = buildListingsPatchRequest(basis);
    const bild = req.patches.find((p) => p.path === "/attributes/main_product_image_locator");
    expect(bild?.value).toEqual([{ media_location: "https://cdn.example.com/haupt.jpg", marketplace_id: "A1PA6795UKMFR9" }]);
  });

  it("erzeugt für leere Slots KEINE Operation (sonst würde live gelöscht)", () => {
    const req = buildListingsPatchRequest({ ...basis, description: "", backendKeywords: null, mainImageUrl: undefined });
    const pfade = req.patches.map((p) => p.path);
    expect(pfade).not.toContain("/attributes/product_description");
    expect(pfade).not.toContain("/attributes/generic_keyword");
    expect(pfade).not.toContain("/attributes/main_product_image_locator");
  });

  it("nummeriert Galeriebilder ab 1", () => {
    const req = buildListingsPatchRequest({ ...basis, galleryImageUrls: ["https://a/1.jpg", "https://a/2.jpg"] });
    expect(req.patches.map((p) => p.path)).toEqual(
      expect.arrayContaining(["/attributes/other_product_image_locator_1", "/attributes/other_product_image_locator_2"]),
    );
  });

  it("setzt mode=VALIDATION_PREVIEW nur beim Trockenlauf", () => {
    expect(buildListingsRequestMeta("A1", basis, "VALIDATION_PREVIEW").query.mode).toBe("VALIDATION_PREVIEW");
    expect(buildListingsRequestMeta("A1", basis, "PUBLISH").query.mode).toBeUndefined();
    expect(buildListingsRequestMeta("A1", basis, "PUBLISH").query.issueLocale).toBe("de_DE");
  });
});

describe("Publish-Gate", () => {
  it("lässt ein sauberes Paket durch", () => {
    expect(publishBereit(pruefePublish(basis))).toBe(true);
  });

  it("blockt Tabulatoren und Markup", () => {
    const issues = pruefePublish({ ...basis, title: "Titel\tmit Tab", bullets: ["<b>fett</b>", "b", "c", "d", "e"] });
    expect(issues.some((i) => i.code === "title.steuerzeichen" && i.severity === "error")).toBe(true);
    expect(issues.some((i) => i.code === "bullets.markup" && i.severity === "error")).toBe(true);
    expect(publishBereit(issues)).toBe(false);
  });

  it("warnt, dass unvollständige Bullets die restlichen Plätze leeren", () => {
    const issues = pruefePublish({ ...basis, bullets: ["nur eins"] });
    expect(issues.find((i) => i.code === "bullets.unvollstaendig")?.quelle).toBe("amazon");
  });

  it("blockt den fehlenden Produkttyp nur für den API-Weg — die Flat File bekommt eine Warnung", () => {
    // Der Flat-File-Weg kommt ohne feed_product_type notdürftig durch, die API nicht.
    expect(pruefePublish({ ...basis, productType: null }).find((i) => i.code === "producttype.fehlt")?.severity).toBe("warning");
    expect(pruefePublish({ ...basis, productType: null }, { fuerApi: true }).find((i) => i.code === "producttype.fehlt")?.severity).toBe("error");
  });

  it("erkennt nicht ladbare Bildquellen", () => {
    expect(pruefeBildUrl("https://drive.google.com/file/d/x/view").ok).toBe(false);
    expect(pruefeBildUrl("http://cdn.example.com/a.jpg").ok).toBe(false);
    expect(pruefeBildUrl("https://cdn.example.com/a.jpg?X-Amz-Signature=abc").ok).toBe(false);
    expect(pruefeBildUrl("s3://bucket/a.jpg").ok).toBe(true);
    expect(pruefeBildUrl("https://cdn.example.com/a.jpg").ok).toBe(true);
  });

  it("trennt Amazon-Ablehnung von Agentur-Messlatte", () => {
    const issues = pruefePublish({ ...basis, title: "x".repeat(120) });
    const laenge = issues.find((i) => i.code === "title.laenge");
    expect(laenge?.quelle).toBe("agentur");
    expect(laenge?.severity).toBe("warning");
  });
});
