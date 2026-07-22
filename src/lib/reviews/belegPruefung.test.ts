import { describe, expect, it } from "vitest";
import { verifiziereZitate } from "./belegPruefung";

/** D152: Zitate müssen wörtlich existieren und Aspekte belegen. */
const reviews = [
  { rating: 5, title: "Super", body: "Nachdem medizinische Gründe ärztlich ausgeschlossen werden konnten, probierten wir es mit Hausmittelchen" },
  { rating: 1, title: "Enttäuscht", body: "Kein eines von diesen Dingern hat mein Hund gegessen" },
  { rating: 4, title: "Gut", body: "Jetzt ist die Verdauung super und das Fell glänzt wieder." },
];

const aspekt = (label: string, quotes: string[]) => ({ label, frequencyPct: null, mentionCount: 10, quotes });

describe("verifiziereZitate", () => {
  it("behält nur wörtlich auffindbare Zitate; erfundene werden gezählt entfernt", () => {
    const { aspekte, notizen } = verifiziereZitate(
      [aspekt("Fellglanz verbessert", ["Jetzt ist die Verdauung super und das Fell glänzt wieder.", "Der Tierarzt hat es empfohlen"])],
      reviews,
      "buyingTrigger",
    );
    expect(aspekte[0].quotes).toEqual(["Jetzt ist die Verdauung super und das Fell glänzt wieder."]);
    expect(notizen.some((n) => n.includes("1 Zitat(e) ohne wörtliche Fundstelle"))).toBe(true);
  });

  it("Aspekt ohne einen einzigen Beleg wird verworfen und ausgewiesen", () => {
    const { aspekte, notizen } = verifiziereZitate(
      [aspekt("Empfehlung durch Tierarzt", ["Mein Tierarzt hat dieses Produkt ausdrücklich empfohlen"])],
      reviews,
      "buyingTrigger",
    );
    expect(aspekte).toEqual([]);
    expect(notizen[0]).toContain("Empfehlung durch Tierarzt");
    expect(notizen[0]).toContain("verworfen");
  });

  it("Kaufauslöser mit 1★-Belegen bekommt einen sichtbaren Sentiment-Hinweis", () => {
    const { aspekte, notizen } = verifiziereZitate(
      [aspekt("Hund frisst es gerne", ["Kein eines von diesen Dingern hat mein Hund gegessen"])],
      reviews,
      "buyingTrigger",
    );
    expect(aspekte).toHaveLength(1); // nicht still umsortiert — ausgewiesen
    expect(notizen.some((n) => n.includes("1.0★") && n.includes("prüfen"))).toBe(true);
  });

  it("mentionCount = VERSCHIEDENE Reviews mit verifizierter Fundstelle — der Code zählt, nie das LLM (D170)", () => {
    const { aspekte } = verifiziereZitate(
      [
        aspekt("Verdauung und Fell", [
          "Jetzt ist die Verdauung super und das Fell glänzt wieder.", // Review 3
          "die Verdauung super und das Fell glänzt", // ebenfalls Review 3 → zählt nicht doppelt
          "Kein eines von diesen Dingern hat mein Hund gegessen", // Review 2
          "Der Tierarzt hat es empfohlen", // erfunden → zählt nicht
        ]),
      ],
      reviews,
      "buyingTrigger",
    );
    expect(aspekte[0].mentionCount).toBe(2); // LLM-Wert 10 überschrieben
    expect(aspekte[0].frequencyPct).toBeNull();
  });

  it("Groß-/Kleinschreibung und Anführungszeichen stören den Abgleich nicht", () => {
    const { aspekte } = verifiziereZitate(
      [aspekt("Ärztlich abgeklärt", ["nachdem medizinische gründe ÄRZTLICH ausgeschlossen werden konnten"])],
      reviews,
      "painPoint",
    );
    expect(aspekte).toHaveLength(1);
  });
});
