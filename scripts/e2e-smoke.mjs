import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage();
const base = "http://localhost:3000";

// 1 · Portfolio → Kunde anlegen → Redirect in den Marken-Workspace
await p.goto(base, { waitUntil: "networkidle" });
console.log("1. Portfolio:", await p.locator("h1").textContent());
await p.fill('input[name="name"]', "AquaNova GmbH");
await p.click("text=Anlegen");
await p.waitForURL(/\/marke\//, { timeout: 20000 });
console.log("2. Workspace geöffnet:", await p.locator("h1").textContent());

// 2 · Katalog → Produkt anlegen → Produktseite
await p.click("text=Katalog");
await p.waitForSelector('input[name="asin"]');
await p.fill('input[name="name"]', "Edelstahl-Trinkflasche 750 ml");
await p.fill('input[name="asin"]', "B0TESTASIN");
await p.click("text=+ Produkt");
await p.waitForURL(/\/produkte\//, { timeout: 20000 });
console.log("3. Produktseite:", (await p.locator("h1").textContent())?.trim());

// 3 · Produkt-Wahrheit + Keywords
await p.fill('input[name="productType"]', "Trinkflasche");
await p.fill('input[name="dimensions"]', "750 ml");
await p.fill('input[name="usps"]', "hält 24 h kalt | auslaufsicher | BPA-frei");
await p.fill('input[name="targetAudience"]', "Sport und Büro");
await p.click("text=Speichern");
await p.waitForTimeout(1200);
await p.fill('textarea[name="keywords"]', "edelstahl trinkflasche;18100\nthermosflasche;9900\nisolierflasche;6600\nsportflasche;4400");
await p.click("text=Keywords speichern");
await p.waitForTimeout(1200);
console.log("4. Wahrheit + Keywords gespeichert");

// 4 · Titel generieren
await p.locator('form:has(input[value="title"]) button').click();
await p.waitForSelector("text=/75", { timeout: 30000 });
console.log("5. Titel generiert (Zähler sichtbar)");

// 5 · Handlungen ableiten
await p.click("text=← Katalog");
await p.waitForURL(/\/marke\/.*\/katalog/, { timeout: 15000 });
await p.click("text=Handlungen");
await p.waitForSelector("text=Aus Analysen ableiten", { timeout: 15000 });
await p.click("text=Aus Analysen ableiten");
await p.waitForTimeout(2500);
const items = await p.locator("main ul li").count();
console.log("6. Handlungen abgeleitet:", items, "Einträge");

// 6 · Cockpit-Kacheln
await p.click("text=Cockpit");
await p.waitForSelector("text=Offene Handlungen", { timeout: 15000 });
console.log("7. Marken-Cockpit zeigt Kacheln");

await b.close();
console.log("E2E OK");
