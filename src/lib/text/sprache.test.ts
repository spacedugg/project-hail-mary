import { describe, expect, it } from "vitest";
import { amazonDomain, erkenneSprache, marktplatzFuerSprache, marktplatzSprache } from "./sprache";

describe("erkenneSprache (D128) — Heuristik über die Gesamtmenge, passiv bei Unsicherheit", () => {
  it("erkennt eine deutsche Keyword-Liste", () => {
    const kws = ["trinkflasche edelstahl", "wasserflasche für kinder", "flasche mit strohhalm", "isolierflasche groß", "trinkflasche kohlensäure geeignet", "flasche ohne plastik", "trinkflasche für unterwegs"];
    expect(erkenneSprache(kws).sprache).toBe("de");
  });

  it("erkennt eine englische Keyword-Liste", () => {
    const kws = ["water bottle stainless steel", "bottle with straw for kids", "insulated bottle large", "sports bottle without plastic", "drinking bottle for the gym", "leakproof bottle black"];
    expect(erkenneSprache(kws).sprache).toBe("en");
  });

  it("erkennt eine französische Keyword-Liste", () => {
    const kws = ["bouteille d'eau acier inoxydable", "gourde pour enfant avec paille", "bouteille isotherme sans plastique", "gourde de sport pour les enfants", "bouteille réutilisable grande"];
    expect(erkenneSprache(kws).sprache).toBe("fr");
  });

  it("bleibt bei mehrdeutigem Mini-Input ehrlich passiv (kein Fehlurteil auf dünner Basis)", () => {
    expect(erkenneSprache(["camping"]).sprache).toBeNull();
  });
});

describe("Marktplatz-Zuordnung (D128)", () => {
  it("Sprache je Marktplatz — uk und us sprechen Englisch, nl hat keine Content-Sprache", () => {
    expect(marktplatzSprache("de")).toBe("de");
    expect(marktplatzSprache("uk")).toBe("en");
    expect(marktplatzSprache("us")).toBe("en");
    expect(marktplatzSprache("nl")).toBeNull();
  });

  it("Scrape-Marktplatz je Content-Sprache", () => {
    expect(marktplatzFuerSprache("en")).toBe("uk");
    expect(marktplatzFuerSprache("de")).toBe("de");
  });

  it("amazonDomain: amazon.uk existiert nicht — co.uk; us = com", () => {
    expect(amazonDomain("uk")).toBe("co.uk");
    expect(amazonDomain("us")).toBe("com");
    expect(amazonDomain("de")).toBe("de");
  });
});
