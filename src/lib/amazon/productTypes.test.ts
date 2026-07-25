import { describe, it, expect } from "vitest";
import { pruefeProdukttyp, schlageProdukttypVor } from "./productTypes";
import { pruefeSprache, amazonProduktUrl } from "@/lib/scrape/amazonUrl";
import { pruefePublish, publishBereit } from "./publishGate";
import type { PublishInput } from "./listingsPayload";

describe("Amazon-Produkttyp", () => {
  it("erkennt eine Beschreibung als Freitext — die lehnt die API ab", () => {
    expect(pruefeProdukttyp("Doppelwandige Thermogläser").stand).toBe("freitext");
    expect(pruefeProdukttyp("drinking cup").stand).toBe("freitext");
  });

  it("akzeptiert bekannte Token", () => {
    expect(pruefeProdukttyp("DRINKING_CUP").stand).toBe("bekannt");
    expect(pruefeProdukttyp("HOME_BED_AND_BATH").stand).toBe("bekannt");
  });

  it("wertet unbekannte, aber formal gültige Token als Hinweis — nicht als Fehler", () => {
    // Unsere Liste ist unvollständig; das darf nicht wie ein Amazon-Verbot aussehen.
    expect(pruefeProdukttyp("SOME_EXOTIC_TYPE_2").stand).toBe("unbekannt");
  });

  it("schlägt aus der Beschreibung einen Token vor", () => {
    expect(schlageProdukttypVor("Doppelwandige Thermogläser")).toBe("DRINKING_CUP");
    expect(schlageProdukttypVor("Edelstahl-Trinkflasche 750 ml")).toBe("WATER_BOTTLE");
    expect(schlageProdukttypVor("etwas völlig anderes")).toBeNull();
  });
});

const basis: PublishInput = {
  sku: "ELB-LM-350-4",
  asin: "B0B1WQQHMH",
  productType: "DRINKING_CUP",
  marketplace: "de",
  title: "ElbFuchs Latte-Macchiato-Gläser doppelwandig, 4 x 350 ml",
  bullets: ["a", "b", "c", "d", "e"],
};

describe("Publish-Gate: Schlüsselfelder", () => {
  it("blockt einen Freitext-Produkttyp hart", () => {
    const issues = pruefePublish({ ...basis, productType: "Doppelwandige Thermogläser" });
    const i = issues.find((x) => x.code === "producttype.freitext");
    expect(i?.severity).toBe("error");
    expect(i?.quelle).toBe("amazon");
    expect(publishBereit(issues)).toBe(false);
  });

  it("erzeugt für einen unbekannten Token nur einen Hinweis", () => {
    const issues = pruefePublish({ ...basis, productType: "EXOTIC_THING" });
    expect(issues.find((x) => x.code === "producttype.unbekannt")?.severity).toBe("warning");
    expect(publishBereit(issues)).toBe(true);
  });

  it("weist die ASIN-als-SKU-Krücke aus", () => {
    const issues = pruefePublish({ ...basis, sku: "B0B1WQQHMH", skuIstNotbehelf: true });
    expect(issues.find((x) => x.code === "sku.notbehelf")?.severity).toBe("warning");
  });
});

describe("Sprachfassung des Imports", () => {
  it("hängt den language-Parameter an die Produkt-URL", () => {
    expect(amazonProduktUrl("b0b1wqqhmh", "de")).toBe("https://www.amazon.de/dp/B0B1WQQHMH?language=de_DE");
    expect(amazonProduktUrl("B0X", "uk")).toBe("https://www.amazon.co.uk/dp/B0X?language=en_GB");
  });

  it("erkennt eine englische Fassung auf einem DE-Marktplatz", () => {
    const en = "ElbFuchs Latte Macchiato Glasses Double-Walled. The glasses are dishwasher safe and ideal for your coffee with milk.";
    expect(pruefeSprache(en, "de").passt).toBe(false);
  });

  it("lässt echten deutschen Text durch", () => {
    const de = "ElbFuchs Latte-Macchiato-Gläser doppelwandig. Die Gläser sind spülmaschinenfest und ideal für Ihren Kaffee mit Milch.";
    expect(pruefeSprache(de, "de").passt).toBe(true);
  });

  it("prüft auf englischsprachigen Marktplätzen nicht", () => {
    expect(pruefeSprache("The glasses are dishwasher safe and ideal for your coffee.", "uk").passt).toBe(true);
  });
});
