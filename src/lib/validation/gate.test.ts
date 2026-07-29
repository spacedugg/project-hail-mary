import { describe, it, expect } from "vitest";
import { byteLength, charLength, trimToBytesByWord, normalizeToken } from "@/lib/text/bytes";
import {
  validateTitle,
  validateBullets,
  validateBackendKeywords,
  validateDescription,
  validateListing,
  validateItemHighlights,
  entferneUnbelegteZahlSaetze,
  pruefeZahlenTreue,
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
  "Die AquaNova Edelstahl-Trinkflasche begleitet dich durch den Tag — vom Frühstück bis zum Training. Ihre doppelwandige Vakuum-Isolierung sorgt für konstante Temperatur, während der auslaufsichere Verschluss Tasche und Laptop schützt. Zur Reinigung wandert der Deckel in die Spülmaschine, die Flasche säubert die beiliegende Bürste. Mit 7,3 cm Durchmesser passt sie in alle gängigen Autohalter.";

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
  it("unter 60 Zeichen ist FEHLER (Pflichtband 60–75, Nutzer-Regel 28.07./D240)", () => {
    const short = "AquaNova Edelstahl-Trinkflasche 750 ml"; // 38 Zeichen
    const hits = validateTitle(short, ctx).filter((i) => i.rule === "title.budget");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("error");
  });
  it("im Band 60–75 ist OK, darunter FEHLER — Untergrenze für abgeleitete Varianten-Titel (D240)", () => {
    const imBand = "AquaNova Edelstahl-Trinkflasche 750 ml isoliert BPA-frei robust";
    const zuKurz = "AquaNova Edelstahl-Trinkflasche 750 ml auslaufsicher BPA";
    expect(charLength(imBand)).toBeGreaterThanOrEqual(60);
    expect(charLength(imBand)).toBeLessThanOrEqual(75);
    expect(charLength(zuKurz)).toBeLessThan(60);
    // Titel im neuen Band → KEIN Budget-Fehler; alter 68er-Grenzfall wäre hier durchgefallen.
    expect(validateTitle(imBand, ctx).some((i) => i.rule === "title.budget")).toBe(false);
    // Gegenprobe: unter 60 schlägt title.budget weiter an.
    expect(validateTitle(zuKurz, ctx).some((i) => i.rule === "title.budget")).toBe(true);
  });
  it("fehlendes Hauptkeyword ist ERROR", () => {
    expect(validateTitle("AquaNova Flasche 750 ml, auslaufsicher, isoliert, BPA-frei, mattschwarz", ctx).map((i) => i.rule)).toContain("title.keyword-window");
  });
  it("Hauptkeyword zählt per WORTSTAMM-Abdeckung — Flexion/Komposita statt wörtlicher Phrase (D190)", () => {
    // „Ulmenrinde-Drops für Hunde" deckt „ulmenrinde für hunde" — kein Fehler
    const flektiert = validateTitle("Tierliebhaber Ulmenrinde-Drops für Hunde bei Sodbrennen, 350 g Dose ca", {
      primaryKeywords: ["ulmenrinde für hunde"],
    });
    expect(flektiert.map((i) => i.rule)).not.toContain("title.keyword-window");
    // fehlt ein Inhaltswort-Stamm (hunde), schlägt der Check an
    const fehlt = validateTitle("Tierliebhaber Ulmenrinde-Drops bei Sodbrennen, 350 g in der Vorratsdose", {
      primaryKeywords: ["ulmenrinde für hunde"],
    });
    expect(fehlt.map((i) => i.rule)).toContain("title.keyword-window");
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
  it("Tausenderpunkt zählt NICHT als Satzende (D203, Live-Fall 3.660)", () => {
    const bullet = [
      VALID_BULLET("VIEL BALLASTSTOFF", "3.660 mg Flohsamen pro Portion liefern kräftige Ballaststoffe. Ideal für Erwachsene mit hohem Bedarf. Jede Kapsel enthält 610 mg."),
      ...goodBullets.slice(1),
    ];
    expect(validateBullets(bullet, ctx).map((i) => i.rule)).not.toContain("bullets.sentences");
  });
  it("Abkürzungen (z. B., ca.) zählen NICHT als Satzende (D203)", () => {
    const bullet = [
      VALID_BULLET("PRAKTISCH DOSIERBAR", "Geeignet z. B. für Sport und Büro, ca. 160 Portionen pro Dose. Die Einnahme gelingt einfach mit Wasser."),
      ...goodBullets.slice(1),
    ];
    // 2 echte Sätze trotz drei Punkten (z. B., ca.) → keine Warnung
    expect(validateBullets(bullet, ctx).map((i) => i.rule)).not.toContain("bullets.sentences");
  });
  it("mehr als 3 echte Sätze ist WARNUNG (Gegenprobe)", () => {
    const bullet = [
      VALID_BULLET("VIER SAETZE", "Erster Satz hier. Zweiter Satz hier. Dritter Satz hier. Vierter Satz hier."),
      ...goodBullets.slice(1),
    ];
    expect(validateBullets(bullet, ctx).map((i) => i.rule)).toContain("bullets.sentences");
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
  it("Zahlen-Herkunfts-Check (D114) — der Northpoint-Fall: falsche und erfundene Specs fliegen", () => {
    const quellen = [
      "Northpoint LED Workshop Lamp Work Lamp Bar Light 300 Lumen Wireless Magnet Hook",
      "Battery work light with a very bright luminosity of approx. 300 lumens, powered by 4 x LR6 AA batteries (not included)",
      "Practical magnetic holder (3 magnets) for mounting on metallic objects",
      "Up to 5 hours of light duration. Dimensions: approx. 22 cm x 5.5 cm x 2.2 cm",
    ].join("\n");

    // Falsche Batterienzahl (Quelle: 4 x LR6 AA) → Widerspruch
    const falsch = validateBullets(["HELLES LICHT: Drei AA-Batterien versorgen die Leuchte."], { zahlenQuellen: quellen });
    expect(falsch.map((i) => i.rule)).toContain("bullets.zahl-widerspruch");

    // Erfundene 6500 K → Zahl ohne Quelle
    const erfunden = validateBullets(["ROBUST: Die Farbtemperatur von 6500 K sorgt für Farbwiedergabe."], { zahlenQuellen: quellen });
    expect(erfunden.map((i) => i.rule)).toContain("bullets.zahl-ohne-quelle");

    // Belegte Zahlen passieren: 300 Lumen, 3 Magnete, 5 Stunden, 22 x 5,5 x 2,2 cm
    const korrekt = validateBullets(
      ["HELL: 300 Lumen leuchten alles aus. Drei Magnete halten sicher. Bis zu 5 Stunden Laufzeit bei 22 x 5,5 x 2,2 cm."],
      { zahlenQuellen: quellen },
    );
    expect(korrekt.filter((i) => i.rule.startsWith("bullets.zahl"))).toEqual([]);

    // Ohne Quellen-Kontext: ehrlich passiv (keine Fake-Fehler)
    const passiv = validateBullets(["TEST: 6500 K Farbtemperatur."], {});
    expect(passiv.filter((i) => i.rule.startsWith("bullets.zahl"))).toEqual([]);
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

// ── Neue Checks der Verbindlichkeits-Architektur (D181, Ulmenrinde-Befund) ───

describe("Keyword-Echo-Check (D181)", () => {
  it("roh eingeklebte kleingeschriebene Suchphrase = Fehler (Ulmenrinde-Fall)", () => {
    const issues = validateBullets(
      ["WERDEN GERN GEFRESSEN: Die kot und grasfresser drops hund riechen nach Kräutern und schmecken."],
      { alleKeywords: ["grasfresser drops hund", "ulmenrinde hund"] },
    );
    expect(issues.map((i) => i.rule)).toContain("bullets.keyword-echo");
  });

  it("grammatisch integrierte (großgeschriebene) Keywords passieren", () => {
    const issues = validateBullets(
      ["WERDEN GERN GEFRESSEN: Diese Grasfresser Drops für den Hund riechen nach Kräutern und schmecken gut."],
      { alleKeywords: ["grasfresser drops"] },
    );
    expect(issues.map((i) => i.rule)).not.toContain("bullets.keyword-echo");
  });

  it("Adjektiv-Keywords mit korrekt großem Substantiv passieren (konservativ)", () => {
    const issues = validateTitle("AquaNova spülmaschinenfeste Flasche 750 ml, isoliert und auslaufsicher", {
      alleKeywords: ["spülmaschinenfeste flasche"],
    });
    expect(issues.map((i) => i.rule)).not.toContain("title.keyword-echo");
  });

  it("Titel mit roher Kleinschreib-Phrase = Fehler", () => {
    const issues = validateTitle("Tierliebhaber ulmenrinde hund Drops 350 g für empfindliche Mägen geeignet", {
      alleKeywords: ["ulmenrinde hund"],
    });
    expect(issues.map((i) => i.rule)).toContain("title.keyword-echo");
  });
});

describe("Cross-Bullet-Satzdopplung (D181)", () => {
  it("fast wörtlich wiederholte Aussage in zwei Bullets = Fehler (Magensäure-Fall)", () => {
    const issues = validateBullets([
      "BERUHIGT DEN MAGEN: Die Drops binden überschüssige Magensäure bei empfindlichen Hunden zuverlässig im Alltag.",
      "GUTE AKZEPTANZ: Riechen nach Kräutern und werden gern gefressen, auch von wählerischen Tieren.",
      "PRAKTISCHE DOSE: Diese Drops binden überschüssige Magensäure bei empfindlichen Hunden und sind einfach dosierbar.",
    ]);
    expect(issues.map((i) => i.rule)).toContain("bullets.satz-dopplung");
  });

  it("unterschiedliche Aussagen passieren", () => {
    const issues = validateBullets(goodBullets);
    expect(issues.map((i) => i.rule)).not.toContain("bullets.satz-dopplung");
  });
});

describe("Feature-Headline & Headline-Echo (D181)", () => {
  it("Headline mit Zahl am Anfang = Fehler (350-g-Fall)", () => {
    const issues = validateBullets(["350 G MIT CA. 160 DROPS: Eine Packung reicht über viele Wochen für mittelgroße Hunde."]);
    expect(issues.map((i) => i.rule)).toContain("bullets.headline-feature");
  });

  it("erster Satz wiederholt die Headline wörtlich = Fehler (Beruhigt-den-Magen-Fall)", () => {
    const issues = validateBullets(["BERUHIGT DEN MAGEN SPÜRBAR: Beruhigt den Magen mit Heilerde, Anis und Fenchel bei täglicher Gabe."]);
    expect(issues.map((i) => i.rule)).toContain("bullets.headline-echo-wortgleich");
  });

  it("erster Satz mit Feature-Beleg statt Echo passiert", () => {
    const issues = validateBullets(["BERUHIGT DEN MAGEN SPÜRBAR: Heilerde, Anis und Fenchel binden überschüssige Säure auf natürliche Weise."]);
    expect(issues.map((i) => i.rule)).not.toContain("bullets.headline-echo-wortgleich");
  });
});

describe("Keyword-Echo auch in Beschreibung & Highlights (Scheibe 2)", () => {
  it("rohe Kleinschreib-Phrase in der Beschreibung = Fehler", () => {
    const issues = validateDescription(
      "Die Flasche hält lange kalt. Perfekt als outdoor flasche für unterwegs und im Büro einsetzbar.",
      [],
      { alleKeywords: ["outdoor flasche"] },
    );
    expect(issues.map((i) => i.rule)).toContain("description.keyword-echo");
  });

  it("grammatisch integriert passiert die Beschreibung", () => {
    const issues = validateDescription(goodDescription, [], { alleKeywords: ["outdoor flasche", "edelstahl trinkflasche"] });
    expect(issues.map((i) => i.rule)).not.toContain("description.keyword-echo");
  });
});

describe("Beschreibung: keine Frage-Sätze (D203, Live-Fall 0/10)", () => {
  it("Frage-Satz in der Beschreibung ist ERROR", () => {
    const mitFrage = "Die Flasche hält lange kalt. Wie reinige ich sie? Einfach in die Spülmaschine.";
    expect(validateDescription(mitFrage, [], {}).map((i) => i.rule)).toContain("description.frage");
  });
  it("reine Aussage-Beschreibung passiert", () => {
    expect(validateDescription(goodDescription, [], {}).map((i) => i.rule)).not.toContain("description.frage");
  });
});

describe("Titel-Dopplungs-Check der Item Highlights (D197)", () => {
  const titel = "Tierliebhaber Ulmenrinde-Drops für Hunde gegen Sodbrennen, 350 g mit Moor";

  it("massives Titel-Echo (der Live-Fall: Moor, Sodbrennen, Drops, 350 g doppelt) = FEHLER", () => {
    const issues = validateItemHighlights(
      "Vom Tierarzt entwickelte Drops gegen Sodbrennen und Grasfressen. Mit Moor, Fenchel und Heilerde. 350 g.",
      { freigegebenerTitel: titel },
    );
    const treffer = issues.filter((i) => i.rule === "highlights.titel-dopplung");
    expect(treffer).toHaveLength(1);
    expect(treffer[0].severity).toBe("error");
  });

  it("echte Zusatz-Informationen passieren (Gold-Standard-Muster)", () => {
    const issues = validateItemHighlights(
      "Bei Magenübersäuerung und Grasfressen, mit Heilerde und Fenchel, tierärztlich entwickelt, drei bis vier Wochen Anwendung",
      { freigegebenerTitel: titel },
    );
    expect(issues.filter((i) => i.rule === "highlights.titel-dopplung" && i.severity === "error")).toEqual([]);
  });

  it("ohne freigegebenen Titel bleibt der Check ehrlich passiv", () => {
    const issues = validateItemHighlights("Mit Moor und Drops gegen Sodbrennen. 350 g.", {});
    expect(issues.filter((i) => i.rule === "highlights.titel-dopplung")).toEqual([]);
  });
});

describe("Fakten-Fixer: erfundene Zahl-Sätze streichen (D198)", () => {
  const quellen = "Ulmenrinde Heilerde Moor Fenchel Anis 350 g 160 Drops 2 Drops pro 5 kg";

  it("streicht den Satz mit erfundener Zahl, behält belegte Sätze (der Live-Fall)", () => {
    const bullet = "BERUHIGT DEN MAGEN: Aus sieben natürlichen Bestandteilen zusammengesetzt. Mit Ulmenrinde und Heilerde bei Magenbeschwerden.";
    const { text, entfernt } = entferneUnbelegteZahlSaetze(bullet, quellen);
    expect(entfernt.length).toBe(1);
    expect(text).not.toMatch(/sieben/);
    expect(text).toContain("Ulmenrinde und Heilerde");
    // Ergebnis ist jetzt zahlen-sauber
    expect(pruefeZahlenTreue(text, quellen, "bullets").filter((i) => i.rule.startsWith("bullets.zahl"))).toEqual([]);
  });

  it("belegte Zahlen bleiben unangetastet", () => {
    const bullet = "DOSIERUNG: 2 Drops pro 5 kg Körpergewicht täglich. Die 350 g Dose reicht lange.";
    const { entfernt } = entferneUnbelegteZahlSaetze(bullet, quellen);
    expect(entfernt).toEqual([]);
  });

  it("Zahl, die NUR im Bild-Beleg-Text steht, gilt als belegt (D230 - Nutzer-Fall 30 Sekunden)", () => {
    // „30 Sekunden"/„500 ml" stehen auf dem Status-quo-Bild → fließen als bildBelege in
    // zahlenQuellen → dürfen NICHT als erfunden markiert werden.
    const quellenMitBild = "HOLY Iced Tea Pulver\nBILDER: In 30 Sekunden im Shaker mit 500 ml Wasser gemixt.";
    const text = "Koffeinfrei & vegan; in 30 Sekunden im Shaker mit 500 ml Wasser gemixt.";
    expect(pruefeZahlenTreue(text, quellenMitBild, "highlights").filter((i) => i.rule.startsWith("highlights.zahl"))).toEqual([]);
  });

  it("leert nie den ganzen Text — bleibt kein sauberer Satz, Regenerierung übernimmt", () => {
    const bullet = "TITEL: Nach einer Woche kein Grasfressen mehr.";
    const { text, entfernt } = entferneUnbelegteZahlSaetze(bullet, quellen);
    expect(text).toBe(bullet);
    expect(entfernt).toEqual([]);
  });
});
