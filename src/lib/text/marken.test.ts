import { describe, expect, it } from "vitest";
import { contentMarkenKontext } from "./marken";

/** D149: der „Listing Optimizer im Titel"-Fail darf nie wieder passieren. */
describe("contentMarkenKontext", () => {
  const originalTitel = "TIERLIEBHABER Grass & Drops for Heartburn Dog with Elm Bark";

  it("Werkbank-Fall: Container-Name wird VERBOTEN statt Marke, Eigenmarke runter von der Blacklist", () => {
    const mk = contentMarkenKontext(
      { name: "Listing Optimizer", kind: "workbench" },
      originalTitel,
      ["Tierliebhaber", "AniForte"],
    );
    expect(mk.marke).toBe(""); // Werkzeug-Name ist NIE die Marke
    expect(mk.eigenmarkeAusListing).toBe("TIERLIEBHABER");
    expect(mk.fremdmarken).toEqual(["AniForte", "Listing Optimizer"]); // Eigenmarke raus, Container verboten
  });

  it("echte Marke: bleibt Marke und fliegt aus der Blacklist", () => {
    const mk = contentMarkenKontext({ name: "Tierliebhaber", kind: "brand" }, originalTitel, ["tierliebhaber", "AniForte"]);
    expect(mk.marke).toBe("Tierliebhaber");
    expect(mk.fremdmarken).toEqual(["AniForte"]);
  });

  it("ohne Listing und ohne echte Marke: leer, Blacklist unverändert plus Container", () => {
    const mk = contentMarkenKontext({ name: "Werkbank 3", kind: "workbench" }, null, ["AniForte"]);
    expect(mk.marke).toBe("");
    expect(mk.eigenmarkeAusListing).toBe("");
    expect(mk.fremdmarken).toEqual(["AniForte", "Werkbank 3"]);
  });
});
