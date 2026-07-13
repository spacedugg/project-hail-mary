import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage();
const base = "http://localhost:3000";

await p.goto(base, { waitUntil: "networkidle" });
console.log("1. Katalog:", await p.locator("h1").textContent());

// Kunde anlegen
await p.fill('input[name="name"]', "AquaNova GmbH");
await p.click("text=Anlegen");
await p.waitForSelector("text=Marke: AquaNova GmbH", { timeout: 15000 });
console.log("2. Kunde + Default-Marke angelegt");

// Produkt anlegen (redirect auf Produktseite)
await p.fill('section input[name="name"]', "Edelstahl-Trinkflasche 750 ml");
await p.fill('input[name="asin"]', "B0TESTASIN");
await p.click("text=+ Produkt");
await p.waitForURL(/\/produkte\//, { timeout: 15000 });
console.log("3. Produktseite:", await p.locator("h1").textContent());

// Produkt-Wahrheit speichern
await p.fill('input[name="productType"]', "Trinkflasche");
await p.fill('input[name="dimensions"]', "750 ml, 7,3 cm Durchmesser");
await p.fill('input[name="materials"]', "18/8-Edelstahl | Silikondichtung");
await p.fill('input[name="usps"]', "hält 24 h kalt | auslaufsicher | BPA-frei");
await p.fill('input[name="targetAudience"]', "Sport und Büro");
await p.click("text=Speichern");
await p.waitForTimeout(1500);
console.log("4. Produkt-Wahrheit gespeichert");

// Keywords speichern
await p.fill('textarea[name="keywords"]', "edelstahl trinkflasche;18100\nthermosflasche;9900\nisolierflasche;6600\nsportflasche;4400\nwasserflasche;3600\ntrinkflasche kohlensäure;2900\noutdoor flasche;1900\nfahrradflasche;1600\nthermoflasche;1300\nmetallflasche;900\ncampingflasche;700\nwanderflasche;500\nbüroflasche;400\nteeflasche;300\nkaffeeflasche;250\nsommerflasche;200\nwinterflasche;150\nreiseflasche;120\ngymflasche;100\nyogaflasche;90");
await p.click("text=Keywords speichern");
await p.waitForTimeout(1500);
console.log("5. Keywords gespeichert");

// Titel generieren (Mock-Modus, kein Key)
await p.locator('form:has(input[value="title"]) button').click();
await p.waitForSelector("text=mock:", { timeout: 20000 });
const title = await p.locator("h3:has-text('Titel') ~ p, div:has(h3:has-text('Titel')) p").first().textContent();
console.log("6. Generierter Titel:", title?.trim());
const gate = await p.locator("div:has(> div h3:has-text('Titel'))").first().textContent();
console.log("7. Gate-Ausschnitt:", gate?.includes("Gate bestanden") ? "✓ Gate bestanden" : "Befunde vorhanden (siehe UI)");

// Bullets generieren
await p.locator('form:has(input[value="bullets"]) button').click();
await p.waitForTimeout(2500);
const bulletCount = await p.locator("ul.space-y-1 li").count();
console.log("8. Bullets generiert:", bulletCount, "Einträge");

await b.close();
console.log("E2E OK");
