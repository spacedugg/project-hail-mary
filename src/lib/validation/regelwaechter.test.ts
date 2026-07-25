import { describe, it, expect } from "vitest";
import { pruefeFunde } from "./regelwaechter";

const stand = [
  { key: "title.maxChars" as const, label: "Titel — maximale Zeichen", wert: 75, einheit: "Zeichen" },
  { key: "backendKeywords.maxBytes" as const, label: "Backend-Keywords — maximale Bytes", wert: 249, einheit: "Bytes" },
];

const gueltig = {
  key: "title.maxChars",
  vorgeschlagen: 50,
  quelle: "Amazon Seller Central Hilfe",
  url: "https://sellercentral.amazon.de/help/hub/reference/XYZ",
  zitat: "Der Titel darf maximal 50 Zeichen lang sein.",
  sicherheit: "hoch",
};

describe("Regel-Wächter: Annahme-Prüfung", () => {
  it("nimmt einen belegten Fund an", () => {
    const { funde } = pruefeFunde([gueltig], stand);
    expect(funde).toHaveLength(1);
    expect(funde[0]).toMatchObject({ key: "title.maxChars", aktuell: 75, vorgeschlagen: 50, sicherheit: "hoch" });
  });

  it("verwirft einen Fund ohne Quelle oder Zitat", () => {
    const { funde, verworfen } = pruefeFunde([{ ...gueltig, url: "" }, { ...gueltig, zitat: "kurz" }], stand);
    expect(funde).toHaveLength(0);
    expect(verworfen).toHaveLength(2);
    expect(verworfen[0]).toMatch(/Quelle/);
  });

  it("verwirft unplausible Werte statt sie vorzuschlagen", () => {
    // 5000 Zeichen Titel wäre ein Lesefehler, kein Amazon-Update.
    const { funde, verworfen } = pruefeFunde([{ ...gueltig, vorgeschlagen: 5000 }], stand);
    expect(funde).toHaveLength(0);
    expect(verworfen[0]).toMatch(/unplausibel/);
  });

  it("verwirft Nicht-Zahlen und unbekannte Regeln", () => {
    const { funde, verworfen } = pruefeFunde(
      [{ ...gueltig, vorgeschlagen: "ungefähr 50" }, { ...gueltig, key: "titel.laenge" }],
      stand,
    );
    expect(funde).toHaveLength(0);
    expect(verworfen.join(" ")).toMatch(/ganze Zahl/);
    expect(verworfen.join(" ")).toMatch(/Unbekannte Regel/);
  });

  it("meldet keinen Vorschlag, wenn der Wert unserem Stand entspricht", () => {
    const { funde, verworfen } = pruefeFunde([{ ...gueltig, vorgeschlagen: 75 }], stand);
    expect(funde).toHaveLength(0);
    expect(verworfen).toHaveLength(0); // kein Fehler — schlicht keine Änderung
  });

  it("stuft ohne erkennbare Sicherheitsangabe auf niedrig ein", () => {
    const { funde } = pruefeFunde([{ ...gueltig, sicherheit: "ziemlich sicher" }], stand);
    expect(funde[0].sicherheit).toBe("niedrig");
  });
});
