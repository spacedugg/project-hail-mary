import { describe, it, expect } from "vitest";
import { byteLength, charLength, trimToBytesByWord, normalizeToken } from "@/lib/text/bytes";
import {
  validateTitle,
  validateBullets,
  validateBackendKeywords,
  validateDescription,
  validateListing,
} from "./gate";

const VALID_BULLET = (head: string, body: string) => `${head}: ${body}`;

// Realistischer Beispiel-Content (Trinkflaschen-Beispiel aus dem Blog-Korpus)
// 73 Zeichen — im 70–75-Zielband (Spec-Update 07/2026)
const goodTitle =
  "AquaNova Edelstahl-Trinkflasche 750 ml, auslaufsicher, isoliert, BPA-frei";

const goodBullets = [
  VALID_BULLET(
    "HÄLT 24 STUNDEN KALT",
    "Doppelwandige Vakuum-Isolierung aus 18/8-Edelstahl hält Getränke 24 h kalt und 12 h heiß. Ideal für Büro, Sport und unterwegs im Auto oder Zug bei jedem Wetter.",
  ),
  VALID_BULLET(
    "GARANTIERT AUSLAUFSICHER",
    "Der Schraubverschluss mit Silikondichtung schließt zuverlässig dicht — kein Tropfen in Tasche oder Rucksack. Auch bei kohlensäurehaltigen Getränken sicher nutzbar.",
  ),
  VALID_BULLET(
    "OHNE SCHADSTOFFE",
    "BPA-frei und geschmacksneutral: Lebensmittelechter Edelstahl statt Kunststoff im Trinkbereich. Kein metallischer Beigeschmack, geprüft nach EU-Lebensmittelstandard.",
  ),
  VALID_BULLET(
    "LEICHT ZU REINIGEN",
    "Große Öffnung für Eiswürfel und Flaschenbürste, Deckel spülmaschinenfest. Die pulverbeschichtete Oberfläche bleibt griffig und frei von Fingerabdrücken im Alltag.",
  ),
  VALID_BULLET(
    "DURCHDACHTER LIEFERUMFANG",
    "Trinkflasche 750 ml, Ersatzdichtung und Reinigungsbürste im Set. Passt in gängige Autohalterungen und Fahrradhalter mit 7,3 cm Durchmesser, wiegt nur 320 g.",
  ),
];

const goodDescription =
  "Die AquaNova Edelstahl-Trinkflasche begleitet dich durch den Tag — vom Frühstück bis zum Training. Ihre doppelwandige Vakuum-Isolierung sorgt für konstante Temperatur, während der auslaufsichere Verschluss Tasche und Laptop schützt. Wie reinige ich die Flasche? Deckel in die Spülmaschine, Flasche mit der beiliegenden Bürste. Passt sie in Autohalterungen? Ja, mit 7,3 cm Durchmesser in alle gängigen Halter.";

const goodBackend = "thermosflasche isolierflasche sportflasche fahrrad wandern camping outdoor edelstahlflasche kohlensäure geeignet metallflasche trinkflaschen thermo iso";

const ctx = {
  facts: { usps: ["24 Stunden kalt", "auslaufsicher", "BPA-frei"] },
  primaryKeywords: ["Edelstahl-Trinkflasche"],
  competitorBrands: ["Hydro Flask", "Chilly's"],
};

describe("bytes", () => {
  it("zählt UTF-8-Bytes korrekt (Umlaute = 2 Bytes) — seo-os-Regression", () => {
    expect(byteLength("Trinkflasche")).toBe(12);
    expect(byteLength("Auslaufhöhe")).toBe(12); // ö = 2 Bytes
    expect(byteLength("äöüß")).toBe(8);
    expect("äöüß".length).toBe(4); // genau der Fehler, den wir NICHT machen
  });
  it("charLength zählt Grapheme", () => {
    expect(charLength("Größe")).toBe(5);
  });
  it("trimToBytesByWord schneidet wortweise", () => {
    expect(trimToBytesByWord("eins zwei drei", 9)).toBe("eins zwei");
  });
  it("normalizeToken stammt deutsche Flexion", () => {
    expect(normalizeToken("Trinkflaschen")).toBe(normalizeToken("Trinkflasche"));
  });
});

describe("validateTitle", () => {
  it("akzeptiert einen guten Titel", () => {
    const errors = validateTitle(goodTitle, ctx).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
  it("leerer Titel ist ERROR (nie stilles Bestehen — seo-os-Regression)", () => {
    expect(validateTitle("", ctx).some((i) => i.severity === "error")).toBe(true);
  });
  it("über 75 Zeichen ist ERROR (Amazon-Limit 07/2026)", () => {
    const long = "AquaNova Edelstahl-Trinkflasche 750 ml, auslaufsicher, doppelwandig isoliert und robust";
    expect(validateTitle(long, ctx).map((i) => i.rule)).toContain("title.max-length");
  });
  it("unter 70 Zeichen ist WARNUNG (Budget nicht ausgenutzt)", () => {
    const short = "AquaNova Edelstahl-Trinkflasche 750 ml";
    const hits = validateTitle(short, ctx).filter((i) => i.rule === "title.budget");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("warning");
  });
  it("fehlendes Hauptkeyword ist ERROR", () => {
    expect(validateTitle("AquaNova Flasche 750 ml, auslaufsicher, isoliert, BPA-frei, mattschwarz", ctx).map((i) => i.rule)).toContain("title.keyword-window");
  });
  it("erkennt Werbephrasen und Emojis", () => {
    expect(validateTitle("Bestseller Trinkflasche 🔥", ctx).map((i) => i.rule)).toEqual(
      expect.arrayContaining(["title.banned-phrase", "title.emoji"]),
    );
  });
  it("erkennt Wettbewerber-Marken", () => {
    expect(validateTitle("Trinkflasche wie Hydro Flask", ctx).map((i) => i.rule)).toContain(
      "title.competitor-brand",
    );
  });
});

describe("validateBullets", () => {
  it("akzeptiert gute Bullets", () => {
    const errors = validateBullets(goodBullets, ctx).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
  it("falsche Anzahl ist ERROR", () => {
    expect(validateBullets(goodBullets.slice(0, 3), ctx).map((i) => i.rule)).toContain("bullets.count");
  });
  it("fehlende VERSALIEN-Headline ist ERROR", () => {
    const bad = [...goodBullets.slice(0, 4), "einfach nur text ohne headline und struktur"];
    expect(validateBullets(bad, ctx).map((i) => i.rule)).toContain("bullets.headline");
  });
  it("USP in zwei Bullets ist ERROR (Cross-Content-USP-Regel)", () => {
    const dup = [...goodBullets.slice(0, 4), VALID_BULLET("NOCHMAL AUSLAUFSICHER", "Wirklich garantiert auslaufsicher, wie schon gesagt wurde in diesem Listing hier oben.")];
    expect(validateBullets(dup, ctx).map((i) => i.rule)).toContain("bullets.usp-duplicate");
  });
});

describe("validateBackendKeywords", () => {
  it("akzeptiert gutes Backend-Feld", () => {
    const errors = validateBackendKeywords(goodBackend, goodTitle, ctx).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
  it("249-Byte-Limit via UTF-8 (Umlaute zählen doppelt)", () => {
    const overByUmlauts = "ä".repeat(125); // 250 Bytes, aber nur 125 Zeichen
    expect(validateBackendKeywords(overByUmlauts, "", ctx).map((i) => i.rule)).toContain("backend.max-bytes");
  });
  it("Kommas sind ERROR", () => {
    expect(validateBackendKeywords("eins, zwei", "", ctx).map((i) => i.rule)).toContain("backend.commas");
  });
  it("warnt bei Dopplung mit sichtbarem Text", () => {
    expect(validateBackendKeywords("edelstahl trinkflasche camping", goodTitle, ctx).map((i) => i.rule)).toContain(
      "backend.visible-duplicate",
    );
  });
  it("Satzzeichen verschwenden Bytes — WARNUNG (Blog 07/2026: Amazon ignoriert sie)", () => {
    expect(validateBackendKeywords("salatschüssel; backschüssel.", "", ctx).map((i) => i.rule)).toContain("backend.punctuation");
    expect(validateBackendKeywords("salatschüssel backschüssel prep bowl", "", ctx).map((i) => i.rule)).not.toContain("backend.punctuation");
  });
});

describe("validateListing (Gesamt-Gate)", () => {
  it("gutes Listing besteht", () => {
    const report = validateListing(
      { title: goodTitle, bullets: goodBullets, description: goodDescription, backendKeywords: goodBackend },
      ctx,
    );
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.passed).toBe(true);
  });
  it("KOMPLETT LEERES Listing scheitert hart (seo-os scorte es mit 23/40)", () => {
    const report = validateListing(
      { title: "", bullets: [], description: "", backendKeywords: "" },
      ctx,
    );
    expect(report.passed).toBe(false);
    expect(report.issues.filter((i) => i.severity === "error").length).toBeGreaterThanOrEqual(4);
  });
});
