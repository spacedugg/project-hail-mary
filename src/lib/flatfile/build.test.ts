import { describe, it, expect } from "vitest";
import { parseTemplate, buildFlatfileTxt, mapProductToFields } from "./build";
import { parseListingCsv } from "@/lib/scrape/apifyProduct";

const TXT_TEMPLATE = [
  "TemplateType=fptcustom\tVersion=2026.0714\tSettings=…",
  "Verkäufer-SKU\tMarkenname\tProduktname\tProduktbeschreibung\tAufzählungspunkt\tAufzählungspunkt\tSuchbegriffe\tHersteller",
  "item_sku\tbrand_name\titem_name\tproduct_description\tbullet_point1\tbullet_point2\tgeneric_keywords\tmanufacturer",
].join("\n");

describe("Flat-File-Builder", () => {
  it("parst Vorlagen-Header (txt) und findet die Feldnamen-Zeile", () => {
    const tpl = parseTemplate(new TextEncoder().encode(TXT_TEMPLATE).buffer as ArrayBuffer, "vorlage.txt");
    expect(tpl.headerRows).toHaveLength(3);
    expect(tpl.fieldNames).toContain("item_sku");
    expect(tpl.fieldNames).toContain("bullet_point2");
  });

  it("baut upload-fertige TXT mit Original-Headern + gemappten Daten", () => {
    const tpl = parseTemplate(new TextEncoder().encode(TXT_TEMPLATE).buffer as ArrayBuffer, "vorlage.txt");
    const { content, mappedFields, unmappedFields } = buildFlatfileTxt(tpl, [
      {
        sku: "AN-750-BLK", asin: "B0TESTASIN", brand: "AquaNova",
        title: "AquaNova Edelstahl-Trinkflasche 750 ml", bullets: ["HÄLT KALT: …", "DICHT: …"],
        description: "Beschreibung …", backendKeywords: "thermosflasche isolierflasche",
      },
    ]);
    const lines = content.split("\r\n");
    expect(lines).toHaveLength(4); // 3 Header + 1 Produkt
    expect(lines[0]).toContain("TemplateType=fptcustom");
    const data = lines[3].split("\t");
    expect(data[0]).toBe("AN-750-BLK");
    expect(data[1]).toBe("AquaNova");
    expect(data[4]).toContain("HÄLT KALT");
    expect(mappedFields).toContain("generic_keywords");
    expect(unmappedFields).toContain("manufacturer"); // ehrlich: nicht gemappt
  });

  it("mapProductToFields setzt ASIN als external_product_id", () => {
    const f = mapProductToFields({ sku: "S", brand: "B", asin: "B0XX" });
    expect(f.external_product_id).toBe("B0XX");
    expect(f.external_product_id_type).toBe("ASIN");
  });
});

describe("parseListingCsv (H10-Import)", () => {
  it("liest Title/Bullets/Description aus generischem Export", () => {
    const csv = 'ASIN,Product Title,Bullet 1,Bullet 2,Description\nB0X,"Edelstahl-Flasche 750 ml","HÄLT KALT: gut","DICHT: sicher","Lange Beschreibung"';
    const snap = parseListingCsv(csv);
    expect(snap.title).toContain("Edelstahl");
    expect(snap.bullets).toHaveLength(2);
    expect(snap.description).toContain("Lange");
  });
  it("wirft klaren Fehler bei fremdem Format", () => {
    expect(() => parseListingCsv("Foo,Bar\n1,2")).toThrow(/Title/);
  });
});
