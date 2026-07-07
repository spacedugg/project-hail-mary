# Vollextraktion: seo-operating-system + marketplaceadpros-skills (100%-Durchsicht)

> Zweitdurchgang nach den Kern-Analysen (`docs/SALVAGE.md` §2 und §6). Diese Datei enthält das vollständige Prozess- und Regelwissen beider Quellen, wörtliche Datenkontrakte und alle Neufunde/Korrekturen gegenüber den Kern-Analysen. Alle Pfade relativ zur jeweiligen Quell-Wurzel; Zeilenangaben als `Datei:Zeile`.

---

## 1. Vollständigkeits-Nachweis

### Quelle A: `seo-operating-system-main/` (42 Dateien, alle gesichtet)

| Datei | Status |
|---|---|
| `README.md`, `CLAUDE.md` | vollständig gelesen |
| `prozesse/seo-content-workflow.md` (249 Z.) | vollständig gelesen |
| `optimierung/massnahmenplan.md` (383 Z.) | vollständig gelesen |
| `checklisten/kunden-onboarding.md` (93 Z.), `checklisten/seo-content-qa.md` (98 Z.) | vollständig gelesen |
| `webapp/src/lib/`: `db.ts`, `qa-checks.ts`, `types.ts`, `utils.ts` | vollständig gelesen |
| `webapp/src/app/api/`: `produkte/route.ts`, `produkte/[id]/route.ts`, `keywords/[produktId]/route.ts`, `content/generate/route.ts`, `content/[produktId]/route.ts`, `qa/route.ts` | vollständig gelesen |
| `webapp/src/app/`: `layout.tsx`, `page.tsx`, `globals.css`, `einstellungen/page.tsx`, `produkte/page.tsx`, `produkte/neu/page.tsx`, `produkte/[id]/page.tsx`, `produkte/[id]/keywords/page.tsx`, `produkte/[id]/content/page.tsx`, `produkte/[id]/qa/page.tsx`, `components/sidebar.tsx` | vollständig gelesen |
| `webapp/`: `README.md` (Next.js-Boilerplate), `.env.local.example`, `package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore` | vollständig gelesen |
| `webapp/package-lock.json`, `webapp/public/*.svg` (5), `favicon.ico` | gesichtet, generierte/Asset-Dateien ohne Wissensgehalt |

### Quelle B: `marketplaceadpros-skills/` (15 Dateien + `.DS_Store`, `__MACOSX` ignoriert)

| Datei | Status |
|---|---|
| 11× `SKILL.md`: amazon-ads (185 Z.), amazon-ads-optimization (176), amazon-dsp (121), amazon-listing-audit (137), amazon-reorder-planning (116), amazon-seller-central (96), amazon-title-optimizer (134), experiments (115), fba-inventory-risk-dashboard (170), search-term-harvest-dashboard (123), wasted-ad-spend-dashboard (114) | alle vollständig gelesen |
| `fba-inventory-risk-dashboard/assets/dashboard-template.jsx` (376 Z.) | vollständig gelesen |
| `search-term-harvest-dashboard/assets/dashboard-template.jsx` (641 Z.) | vollständig gelesen |
| `wasted-ad-spend-dashboard/assets/dashboard-template.jsx` (595 Z.) | vollständig gelesen |
| `amazon-reorder-planning/references/dashboard-pointers.md` (42 Z.) | vollständig gelesen |

---

## 2. Quelle A: Prozess-Wissen komplett

### 2.1 IST-Workflow — 5 Phasen mit Zeiten, Rollen, Pain-Points (`prozesse/seo-content-workflow.md`)

**Phase 1 — Kundenübergabe (Sales → Fulfillment)** (Z. 7–44)
- Übergabe-Paket: Google-Drive-Shared-Folder (Input-Ordner: Produktinfos, Farben/Schriften/Brand Guidelines, Voice&Tone), Kunden-E-Mail für Rückfragen; zusätzlich Zugang zu **Content-Projektübersicht** (Google-Tabelle: Produktliste + Fortschrittsstatus + Platz für SEO-Content) und **Produkt-Master-Sheet** (Marke, Gewicht, Preis, EAN etc.).
- Projektplanung: kleine Projekte plant Sales oder Fulfillment-MA selbst; **Retailer-Projekte** (großer Umfang) bekommen dedizierten Projektplaner mit Timelines/Enddates. Aufgaben = **Asana-Tickets** (Idealinhalt: Aufgabenbeschreibung, Link Input-Ordner, Link Projektübersicht, Link Master-Sheet).
- Pain-Points (Z. 38–43): Voice&Tone fehlt in **~90 % der Fälle** (raten/recherchieren); unvollständige Produktinfos „häufig" (Rückfragen verzögern); Ticket ohne Links „gelegentlich"; **kein standardisiertes Übergabeformat: „Immer"** — jede Übergabe sieht anders aus.

**Phase 2 — Keyword-Recherche (~15–25 Min.)** (Z. 47–97)
- 2.1 Wettbewerber identifizieren (~5 Min.): Amazon-Suche; Kriterien: Produkt möglichst ähnlich **und** umsatzseitig besser performend; **4–5 Wettbewerber**, ASINs notieren.
- 2.2 Helium-10-Cerebro (~5 Min.): ASINs eingeben; Filter: **nur Organic Keywords** (keine Paid/Sponsored), **min. 2 Wettbewerber auf Seite 1**, ausreichend Suchvolumen, Produkt-Relevanz; Export.
- 2.3 Manuelle Filterung (~10–20 Min.): typisch **100–200 Keywords** durchgehen; aussortieren: irrelevant, **Wettbewerber-Markennamen**, nicht passend. Hinweis (Z. 77–79): Schritt ist 100 % manuell; KI-Filterung gewünscht, aber Fehlerrisiko v. a. bei Markennamen-Erkennung und Nischenrelevanz.
- 2.4 Backend-Keywords & Pool (~5 Min.): Liste in **Helium 10 Frankenstein** → Duplikate entfernen → Backend-Keywords extrahieren → **6 Hauptkeywords** identifizieren (Sweetspot: hohes Suchvolumen + hohe Relevanz) → Pool + Hauptkeywords ins Content-Sheet.
- Pain-Points (Z. 91–96): 20+ Min. Filterung bei großen Nischen; keine systematische Wettbewerber-Auswahl („Immer", individuelle Einschätzung); Markennamen nicht automatisch erkennbar → **Markenrechtsverstoß-Risiko**; **kein Review-Bewertungsabgleich** („fast immer") → Hidden Spots der Wettbewerber übersehen.

**Phase 3 — Content-Erstellung (~20 Min.)** (Z. 100–156)
- 3.1 ChatGPT-Prompt vorbereiten (~5 Min.): Standard-Prompt liegt als Vorlage im Content-Sheet; eingefügt werden: 6 Hauptkeywords, Vorteile/Merkmale, ggf. Datenblatt, ggf. Voice&Tone.
- 3.2 Content-Regeln (im Prompt hinterlegt, Z. 112–136):
  - **Titel:** beginnt mit Hauptkeyword in ALL CAPS; Hauptvorteil als Eyecatcher; Keywords max. 2× im Titel; Zeichenlimit beachten.
  - **Bullets (5):** je Start mit ALL-CAPS-Keyword/Vorteil; jedes der 6 Hauptkeywords min. 1–2× integriert; **6–12 Keyword-Erwähnungen gesamt**; kein Stuffing; Nutzenkommunikation + Emotionalisierung; Vorteile UND Merkmale.
  - **Beschreibung:** lesefreundlich, Keywords natürlich, verkaufspsychologisch.
  - **Generell:** Keywords so wie Konsumenten suchen; natürlich klingend; **keine Wettbewerber-Keywords**.
- 3.3 Iteration (~15 Min.): Output prüfen (~5), Dialog-Korrektur (~10: Keyword-Platzierung alle 6? Titel-Doppelungen, Lesefreundlichkeit/Verkaufspsychologie, Zeichenlängen), Übertragung ins Sheet (~5).
- Pain-Points (Z. 150–155): Voice&Tone raten (~90 %); Keyword-Prüfung manuell/fehleranfällig; kein automatischer Zeichenzähler; Varianten-Anpassung manuell **5–10 Min./Variante**.

**Phase 4 — Review & Freigabe (variabel)** (Z. 159–186)
- Ablauf: Text in Content-Projektübersicht kopieren → Asana auf **„Ready for Feedback"** → Kunde per E-Mail informieren → Feedback direkt in geteilter Google-Tabelle → ggf. Korrekturschleife (**selten nötig, meist kleinere Anpassungen**) → finale Abnahme.
- Kanäle (Z. 172–177): E-Mail = Kunde; Asana = Ticketstatus (**To Do → In Progress → Ready for Feedback → Done**); Slack = intern (Statusfragen, Scope, Reminders); Google Drive = Content-Sharing.
- Pain-Points: keine automatische Fertig-Benachrichtigung („Immer" manuelle E-Mail); Feedback in Tabelle unstrukturiert; Asana-Status wird vergessen.

**Phase 5 — Upload & Abschluss** (Z. 189–206)
- Manueller Upload in Seller Central, Asana → Done, ggf. Slack-Nachricht. Flat File (Lagerbestandsdatei) wird **nicht standardmäßig genutzt**; bei Retailer-Projekten wäre Bulk-Upload sinnvoll. Pain: manueller Upload pro Produkt skaliert nicht.

**Zeitanalyse gesamt** (Z. 210–225): Keyword-Recherche 5+5+10–20+5; Content 5+5+10+10 → **~55–65 Min. pro Content**; nicht enthalten: Phase 1, Kundenfeedback-Wartezeit, Upload, Korrekturschleifen. README-Baseline (README.md:54–62): ~60 Min. Durchlaufzeit, **5–100+ Stück/Monat**, Keyword-Filterung 100 % manuell, QA nicht formalisiert, ~10 % Input-Vollständigkeit (Voice/Tone).

**Sonderfälle** (Z. 229–248):
- **Varianten** (Farbe/Größe): Content duplizieren + manuell anpassen, ~5–10 Min./Variante, Automatisierungspotenzial hoch (regelbasiert).
- **SEO-Content als Design-Vorlage:** Recherche-Output ist zugleich inhaltliche Grundlage fürs Design-Team (Produktfunktion verstanden, Kern-USPs, Suchverhalten bekannt). Zusatzchance: Wettbewerber-Bewertungsanalyse (aktuell nicht Standard) → Hidden Spots, bemängelte Punkte als Content-Chance, langfristig Produktentwicklungs-Feedback an Kunden.

### 2.2 Die 7 Optimierungshebel im Detail (`optimierung/massnahmenplan.md`)

**Hebel 1 — Standardisierte Input-Architektur** (Z. 8–65)
- Pflicht-Input-Paket (ohne das kein Ticket erstellt wird): Produktname/ASIN, Produktbeschreibung/Datenblatt, **min. 3 Produktbilder**, Zielmarktplatz, Amazon-Hauptkategorie, Markenname, UVP/Preisspanne. Optional: Voice&Tone (Fallback: Standard-Tone), Wettbewerber-ASINs (Fallback: eigene Recherche), bestehende Listings.
- Drive-Template-Ordnerstruktur (Z. 35–52): `01_Input` (Produktinfos-, Voice&Tone-Template mit Fallback-Defaults, bestehende Listings) / `02_Keywords` (Cerebro-Export, gefilterte Liste, Backend-Keywords) / `03_Content` (Projektübersicht, Master-Sheet) / `04_Freigabe` (Kunden-Feedback-Log) / `05_Final` (Upload-Ready).
- Automatische Ordnererstellung via Apps Script/Zapier bei neuem Asana-Projekt.
- Impact: Input-Vollständigkeit ~10 % → >80 %.

**Hebel 2 — Automatisierte Keyword-Pipeline** (Z. 69–117)
- 3-Stufen-Modell: **Stufe 1** regelbasiert (sofort): Cerebro-CSV durch Script, Marken-Blacklist, **Mindest-Suchvolumen z. B. <100/Monat raus**, Kategorie-Filter (z. B. „Ersatzteil"). **Stufe 2** KI-gestützt (mittelfristig): LLM-Relevanzprüfung „Ist Keyword X relevant für Produkt Y?", LLM-Marken-Erkennung; **Mensch bleibt letzte Instanz**; erwartete Ersparnis **50–70 % der Filterzeit** (10–20 → 3–5 Min. Review-only). **Stufe 3** vollautomatisch (langfristig): H10-API, automatische Wettbewerber-Identifikation über Kategorie + Preisspanne; Pipeline ASIN → Wettbewerber → Keywords → Filterung → Hauptkeywords.
- **Marken-Blacklist** (Z. 96–100): zentrale Tabelle pro Kategorie, wird pro Projekt ergänzt (lernendes System), automatischer Abgleich beim CSV-Import.
- **Wettbewerber-Bewertungsanalyse als neuer Prozess-Schritt** (Z. 102–109): systematisches Review-Scraping; identifiziert bemängelte Punkte (Content-Chance), ungelöste Kundenprobleme (USP-Hervorhebung), Feature-Wünsche (Produktentwicklungs-Feedback).

**Hebel 3 — Modularisierte Produktionslogik** (Z. 121–165)
- Baustein-Matrix (Z. 129–136): Keyword-Recherche = Basis, nicht parallel; Backend-Keywords/Titel/Bullets/Beschreibung parallel nach Keywords (semi-automatisierbar LLM+Review); Varianten-Anpassung voll regelbasiert automatisierbar.
- Varianten-Engine: Platzhalter `{{farbe}}`, `{{groesse}}`, `{{material}}`; Batch-Generierung aus Konfigurationstabelle; Mensch reviewt nur Basis-Text. Impact: 5–10 Min. → **<1 Min./Variante**.
- **Prompt als versioniertes Template** (Z. 152–157): zentrale Prompt-Bibliothek, Versionierung mit Datum + Grund, Kategorie-Varianten — nicht lose in ChatGPT-Verläufen.

**Hebel 4 — Klare QA-Scorecard** (Z. 169–202)
- Jeder Content durchläuft Scorecard vor Kundenversand, **min. 80 % (32/40)**.
- Automatisierbare Checks: Titel ≤200, Bullets je ≤500 Zeichen; jedes der 6 Hauptkeywords ≥1×; kein Keyword >2× im Titel; ALL-CAPS-Bullet-Start (Regex); Blacklist-Abgleich.
- **Peer-Review-Regeln** (Z. 191–194): ab **20+ Contents/Monat** Stichprobe durch zweiten MA (**jeder 5. Content**); **neue Mitarbeiter: jeder Content reviewed, bis Scorecard-Schnitt >85 %**.

**Hebel 5 — Produktisiertes Leistungsmodul** (Z. 206–250)
- Modul-Definition (Z. 214–223): Scope = 1 Produkt (Titel + 5 Bullets + Beschreibung + Backend-Keywords); Input = Pflicht-Paket; Lieferzeit **3 Werktage nach vollständigem Input**; **1 Korrekturschleife inklusive**; Varianten **+0,5 Tage pro zusätzliche Farbvariante (max. 5 Min. Aufwand)**.
- Interne SLAs (Z. 227–232): Erstlieferung ≤3 Werktage; Korrekturschleife ≤1 Werktag; Upload nach Freigabe ≤1 Werktag; **bei fehlendem Input nach 48 h automatischer Reminder**.
- Kapazitätsplanung (Z. 236–242): Normal 15–30 Contents/Monat = 1 MA; Hoch 30–60 = 1,5–2 MA; Peak 60–100+ = 2–3 MA oder Automatisierung Stufe 2+.

**Hebel 6 — Volumenspitzen-fähige Delivery** (Z. 254–297)
- Batch-Processing bei **>10 Produkten desselben Kunden**: Keyword-Recherche 1× pro Kategorie, Pool teilen, Varianten-Engine, Flat-File-Bulk-Upload. Batch-Effizienz: 30–40 % Zeitersparnis.
- **Priorisierungs-Framework** (Z. 271–276): P1 kritisch = Launch <5 Tage → sofort, vor allem anderen; P2 hoch = Retailer oder >10 Produkte → ≤3 Tage; P3 normal → SLA 3 Werktage; P4 niedrig = Varianten → Batch.
- Automatisierungs-Effekt (Z. 282–289): Keyword 15–25 → 5–10 Min.; Content 20 → 10–15; QA/Übertragung 10–15 → 5; gesamt ~60 → **~25–30 Min.** = bei 8h-Tag von ~8 auf **~16 Contents/Tag (Kapazitätsverdopplung ohne neue MA)**.

**Hebel 7 — Reduzierte Tool-Friktion** (Z. 301–349)
- IST: **~8 Tool-Wechsel pro Content** (Drive, Sheets, Asana, ChatGPT, Helium 10, Slack, E-Mail, Seller Central) → Ziel ~4. Tool-Landkarte: alles behalten außer ChatGPT („Prüfen: eigene Lösung oder API").
- Integrationen: Quick Wins = Asana↔Slack-Notifications, Drive-Links automatisch ins Ticket, E-Mail-Templates („Content fertig", „Feedback Reminder"). Mittelfristig = Apps-Script-QA, **ChatGPT-API statt Web-UI (Output direkt ins Sheet)**, Asana-API-Ticketerstellung. Langfristig = zentrales Dashboard (Asana-Status + Content-Fortschritt + Keyword-Daten), H10-API.
- Benachrichtigungen zentralisieren (Z. 336–341): Sheet-Trigger Status=„Fertig" → Auto-E-Mail; oder @-Mention-Kommentare; Asana-Automation „Ready for Feedback" → E-Mail-Template.

**Umsetzungs-Roadmap** (Z. 353–383): Phase 1 Quick Wins (Wo. 1–2): Onboarding-Checkliste, QA-Scorecard, E-Mail-Templates, Drive-Template, Blacklist-Start. Phase 2 Systematisierung (Wo. 3–6): Regelfilterung, Varianten-Template, Asana-Slack, SLAs kommunizieren, Priorisierung. Phase 3 Automatisierung (Wo. 7–12): KI-Filterung testen, Apps-Script-QA, ChatGPT-API evaluieren, Flat-File-Batch, Bewertungsanalyse als Standard. Phase 4 Skalierung (ab Monat 4): vollautomatische Pipeline, zentrales Dashboard, Kapazität an SLA-Daten koppeln.

### 2.3 Onboarding-Checkliste komplett (`checklisten/kunden-onboarding.md`)

Grundregel (Z. 3): **kein Asana-Ticket, solange Pflichtfelder unvollständig.**

- **Pflicht-Inputs (Blocker)** (Z. 9–24): Kundenname + Ansprechpartner; E-Mail; Markenname (**exakte Schreibweise wie auf Amazon**); Zielmarktplatz; Produktname(n)/ASIN(s); Kategorie; Produktinfos (min. eines von: Datenblatt/Spezifikationen, Herstellerbeschreibung, bestehender Listing-Text); **min. 3 Bilder** („um Produkt zu verstehen"); UVP/Preisspanne; **Scope — welche Leistungen wurden verkauft (SEO-Text, Design, PPC etc.)**; Drive-Folder mit Template-Struktur eingerichtet.
- **Optionale Inputs** (Z. 26–33): Voice&Tone (formell/locker, Zielgruppe, Sprache); Wettbewerber-ASINs; Hauptkeywords vom Kunden; bestehende Listings; **besondere Hinweise (rechtliche Einschränkungen, verbotene Claims, Zertifizierungen)**; Marken-Styleguide.
- **Bei der Übergabe** (Z. 37–58): Drive prüfen (Struktur kopiert, Input komplett, Projektübersicht mit allen Produkten, Master-Sheet mit Basisdaten, mit Kunde geteilt); Asana prüfen (Projekt angelegt, **jedes Produkt = eigenes Ticket** mit Produktname+ASIN, 3 Links, zugewiesenem MA, **Fälligkeitsdatum basierend auf SLA**; Retailer: Timeline mit Meilensteinen).
- **Kommunikation** (Z. 60–64): Kick-off mit Sales oder Übergabe-Notiz; Kunden-E-Mail bekannt und **getestet**; bei fehlendem Voice&Tone: Standard-Tone-Profil verwenden **und dokumentieren welches**.
- **Eskalationsleiter** (Z. 68–75): Pflicht-Input fehlt → sofort Rückfrage per E-Mail (Fulfillment-MA). Keine Antwort nach **48 h** → Reminder-E-Mail + Sales informieren (Fulfillment-MA). Keine Antwort nach **5 Tagen** → Eskalation an Projektleitung (Sales-MA). Input unbrauchbar (z. B. falsche Sprache) → sofort Rückfrage mit konkretem Beispiel.
- **Quick-Check „production-ready"** (Z. 79–92): 6 Ja/Nein-Fragen (Produkt in einem Satz beschreibbar? Zielgruppe klar? genug Info für Keyword-Recherche? Markenkommunikation bekannt? Drive vollständig? Asana korrekt?). **Regel: min. 5 von 6 „Ja" → Produktion starten, sonst erst Input vervollständigen.**

### 2.4 QA-Scorecard im Wortlaut (`checklisten/seo-content-qa.md`)

Bewertung je Kriterium: **2 = vollständig erfüllt, 1 = teilweise/kleine Mängel, 0 = nicht erfüllt/kritisch.** Freigabe ab **32/40 (80 %)**.

**A. Keyword-Integration (max. 10):**
- A1 Alle 6 Hauptkeywords min. 1× im Content (Titel+Bullets+Beschreibung) — 0: fehlen >2 · 1: fehlen 1–2 · 2: alle vorhanden.
- A2 Hauptkeywords insgesamt 6–12× (kein Stuffing) — 0: <6 oder >15 · 1: 6 oder >12 · 2: 6–12.
- A3 Kein Keyword >2× im Titel — 0: >2 Doppelungen · 1: 1 Doppelung · 2: keine.
- A4 Backend-Keywords erstellt, ohne Duplikate — 0: fehlen · 1: mit Duplikaten · 2: sauber.
- A5 Keine Wettbewerber-Markennamen — 0: Markenname gefunden · (kein 1er) · 2: keine.

**B. Content-Struktur (max. 10):**
- B1 Titel beginnt mit Hauptkeyword — 0: kein Keyword am Anfang · 1: vorhanden, nicht am Anfang · 2: am Anfang.
- B2 Titel ≤200 Zeichen — 0: >250 · 1: 201–250 · 2: ≤200.
- B3 Genau 5 Bulletpoints — 0: ≠5 · 2: genau 5.
- B4 Jeder Bullet beginnt mit ALL-CAPS-Keyword/Vorteil — 0: <3 · 1: 3–4 · 2: alle 5.
- B5 Bullets je ≤500 Zeichen — 0: >2 überschritten · 1: 1 überschritten · 2: alle ≤500.

**C. Content-Qualität (max. 12):**
- C1 Keywords natürlich/lesefreundlich — 0: Stuffing/unlesbar · 1: teils holprig · 2: natürlich fließend.
- C2 Verkaufspsychologie: Vorteile UND Merkmale — 0: nur Features oder vage · 1: überwiegend Features · 2: klarer Nutzen + Features.
- C3 Emotionalisierung/Kaufimpuls — 0: rein sachlich · 1: ansatzweise · 2: klar verkaufsfördernd.
- C4 Voice&Tone passt zur Marke — 0/1/2 (passt nicht / teilweise / konsistent).
- C5 Rechtschreibung/Grammatik — 0: >3 Fehler · 1: 1–3 · 2: fehlerfrei.
- C6 Produktbeschreibung vorhanden & vollständig — 0: fehlt · 1: dünn · 2: vollständig, verkaufsstark.

**D. Prozess-Compliance (max. 8):**
- D1 Content in Projektübersicht eingetragen (0/1/2); D2 Keyword-Pool dokumentiert — 2 nur wenn „sortiert mit Hauptkeywords markiert"; D3 Asana-Status korrekt (0/2); D4 Varianten konsistent (0/1/2).

**Auswertung** (Z. 62–67): 36–40 exzellent → direkt freigeben; 32–35 gut → freigeben (Verbesserung optional); 24–31 ausreichend → Nachbesserung in markierten Bereichen + erneut prüfen; <24 ungenügend → Grundüberarbeitung.

**Automatisierbarkeit** (Z. 73–86): A1/A2/A3 Text-Suche, A5 Blacklist, B2/B5 LEN(), B3 Zählung — ja; C5 Spellcheck-API — teilweise. **Empfehlung: automatisierte Checks als „Pre-Flight" vor manueller Prüfung — spart ~5 Min./Content.** Anwendungsablauf (Z. 90–97): fertig → Auto-Checks → manuelle Kriterien → Score als Spalte in Projektübersicht notieren → ≥32 zum Kunden, <32 Nachbesserung + Neubewertung.

### 2.5 Webapp: harte Fakten (Datenmodell, Prompt, QA-Engine, Verhalten)

**Stack/Deployment:** Next.js 16.1.6, React 19, Tailwind 4, `@anthropic-ai/sdk` ^0.78, `@libsql/client` ^0.17, papaparse (`package.json`). DB: Turso (libsql) wenn `TURSO_DATABASE_URL` gesetzt, sonst lokale Datei `file:seo-tool.db` (`src/lib/db.ts:5–19`). Env (`.env.local.example`): `ANTHROPIC_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. **Keinerlei Auth in der ganzen App.** `initializeDb()` (CREATE TABLE IF NOT EXISTS) läuft bei jedem API-Call.

**Schema** (`db.ts:24–84`): `produkte` (name, brand NOT NULL; asin, marketplace DEFAULT 'Amazon.de', kategorie, preis, produktinfo, voice_tone, status DEFAULT 'neu') → `keywords` (keyword, suchvolumen DEFAULT 0, ist_hauptkeyword 0/1, ist_relevant DEFAULT 1, quelle DEFAULT 'manuell'; FK CASCADE) → `content` (titel, bullet1–5, beschreibung, backend_keywords, version DEFAULT 1; FK CASCADE) → `qa_scores` (scores JSON-Text, total_score, max_score DEFAULT 40, status DEFAULT 'ausstehend', notizen; FK CASCADE). Status-Typ: `"neu" | "keywords" | "content" | "qa" | "fertig"` (`types.ts:61`).

**Status-State-Machine (implizit):** Keywords-POST setzt `status='keywords'` **nur wenn aktuell 'neu'** (`api/keywords/[produktId]/route.ts:59–62`); Generate setzt immer 'content' (`generate/route.ts:96–99`); QA-POST setzt immer 'qa' (`api/qa/route.ts:51–54`); 'fertig' wird manuell per PUT gesetzt — der „Freigeben"-Button erscheint in der UI **nur bei totalScore ≥ 32** (`produkte/[id]/qa/page.tsx:157–165`). Versionierung: `version = COUNT(content für produkt) + 1` (`generate/route.ts:73–93`); Content-Seite lädt immer die **letzte** Version.

**CSV-Import (H10-Autodetect)** (`produkte/[id]/keywords/page.tsx:54–110`): PapaParse header-basiert; Keyword-Spalte = `Keyword | keyword | Phrase | phrase | Search Term | erste Spalte`; Volumen = `Search Volume | search_volume | Suchvolumen | Volume | Estimated Exact Search Volume`; Volumen-Parsing strippt Nicht-Ziffern; quelle='csv-import'; Bulk-Insert via `db.batch`.

**buildPrompt-Kontrakt** (`api/content/generate/route.ts:119–202`) — Modell `claude-sonnet-4-20250514`, max_tokens 4000, Kosten laut Einstellungen-Seite **ca. $0.01–0.03/Generierung**, UI-Erwartung „ca. 15–30 Sekunden":
- Rolle: „erfahrener Amazon-SEO-Spezialist". Inputs: Name, Marke, Marketplace, Kategorie/Preis/Produktdetails (Fallback „Nicht angegeben"), Voice&Tone nur wenn vorhanden; **6 Hauptkeywords „MÜSSEN integriert werden"** + max. **30 weitere Keywords** („optional integrieren"), sortiert Hauptkeyword→Suchvolumen.
- Regeln: Titel — wichtigstes Hauptkeyword in GROSSBUCHSTABEN am Anfang, Eyecatcher-Vorteil, max. 2× gleiches Keyword, **max. 200 Zeichen**, **Format: `HAUPTKEYWORD - Marke - Kernvorteil - weitere Keywords`**. 5 Bullets — Start je KEYWORD/VORTEIL in CAPS, alle 6 Hauptkeywords je 1–2× (6–12 gesamt), je **max. 500 Zeichen**, Verkaufspsychologie + Emotionalisierung. Beschreibung — Fließtext, organisch, keine Wettbewerber-Keywords. **Backend-Keywords — „Alle übrigen relevanten Keywords, die nicht im sichtbaren Content sind, kommagetrennt, keine Duplikate zum sichtbaren Text, maximal 249 Bytes."** Optionale Zusatz-Anweisungen des Nutzers werden angehängt.
- Ausgabeformat: Marker-Blöcke `[TITEL] [BULLET1..5] [BESCHREIBUNG] [BACKEND]`; Parser = Regex zwischen Markern (`generate/route.ts:204–230`) — kein JSON, brüchig bei Abweichung.

**QA-Engine** (`src/lib/qa-checks.ts`) — automatisiert nur A1–A4 und B1–B5; Details:
- A1: `allText.includes(keyword)` (case-insensitive Substring); 0 fehlende=2, ≤2 fehlende=1, sonst 0 (Z. 33–48).
- A2 **Logikbug bestätigt** (Z. 61–66): `punkte = 6–12 ? 2 : (count>=6 || count<=15) ? 1 : 0` — die Oder-Bedingung ist immer wahr → **0 Punkte unerreichbar**, jeder Wert außerhalb 6–12 bekommt 1.
- A3: Regex-Count je Hauptkeyword im Titel, >2 Treffer = Duplikat (Z. 71–88). A4: nur Existenz-Check, **prüft keine Duplikate und keine 249 Bytes** (Z. 90–102). A5: hardcoded 2 „Manuell prüfen" (Z. 104–112).
- B1: `titel.startsWith(hauptkeywords[0])` — Referenz ist das volumenstärkste Hauptkeyword; nicht-leerer Titel ohne Keyword-Start bekommt trotzdem 1 (Z. 114–128). B2: `titel.length` (JS-UTF-16-Länge, nicht Bytes/Grapheme). B4: nur **erstes Wort** (Split an `[\s–—:-]`) auf Uppercase geprüft, Mindestlänge 2 (Z. 151–163) — Doku verlangt „ALL CAPS Keyword/Vorteil", Code prüft nur 1 Wort.
- C1–C6 hardcoded 1 Punkt („Manuell bewerten"; C6-Kommentar prüft nur `beschreibung.length > 50`), D1–D4 hardcoded 2 Punkte („Via App") (Z. 179–236) → **16/40 Punkte fix vergeben; leeres Listing scort 23/40** (nachgerechnet: A=5, B=4, C=6, D=8).
- Statusgrenzen identisch zur Doku: ≥36 excellent, ≥32 good, ≥24 adequate, sonst insufficient (Z. 245–252).
- QA-PUT erlaubt manuelles Überschreiben einzelner Scores + Notizen, Total/Status werden neu berechnet (`api/qa/route.ts:70–102`); UI bietet 0/1/2-Buttons je Kriterium und Scorecard-Export als Text-Datei.

**Sonstiges:** Produkt-PUT mit Feld-Whitelist (`api/produkte/[id]/route.ts:35–38`); DELETE kaskadiert. Export des Contents als `.txt` mit Abschnitts-Labels (`content/page.tsx:81–91`). Zeichenzähler in der UI: Titel x/200, Bullets x/500, rot bei Überschreitung. Marketplace-Auswahl: DE/COM/UK/FR/IT/ES (`produkte/neu/page.tsx:98–104`). `produkte/[id]/page.tsx:33–38` enthält einen toten Doppel-Fetch (Qualitätsindiz). CLAUDE.md: alles auf Deutsch, `claude/*`-Branches, nie direkt auf main.

---

## 3. Quelle B: Datenkontrakte, Tier-Formeln, Neufunde

### 3.1 Gemeinsame Design-/Kontrakt-Basis der 3 Dashboards

- **Muster:** Skill befüllt ausschließlich `RAW`-Array + Masthead-Konstanten; alle Fachlogik (Tiering, abgeleitete Werte, Captions) lebt im Template. Wörtlich in allen 3 Templates: **„Do not modify the styling — the editorial-financial aesthetic is part of the skill"** (fba:20, waste:18–19, harvest:21–23; waste/harvest ergänzen „must stay in sync with" den Geschwister-Dashboards).
- **Palette identisch dreifach kopiert** (fba:48–58): `bg #f4eee0, paper #fbf7ec, ink #1a1612, mute #7a6f5e, rule #d4cab3, oxblood #8a1c1c, amber #a86a16, olive #7a7320, forest #2c3a2c`. Fonts: Instrument Serif (Display/Zahlen), Geist, Geist Mono — per **Google-Fonts-Runtime-Injection** ins `document.head` (fba:119–128, in allen dreien; CSP-fragil, Anti-Pattern).
- Gemeinsame UI-Bausteine: Masthead „⏱ Live · BRAND · MARKETPLACE" + SNAPSHOT/WINDOW; 4 Stat-Kacheln; Suchfeld; sortierbare Tabelle mit Magnitude-Bars; 3-spaltiger Footer **Methodology / Caveats-bzw.-Excluded-bzw.-Reach / Source**.

### 3.2 FBA Inventory Risk Dashboard

**RAW-Schema wörtlich** (`fba…/assets/dashboard-template.jsx:6–17`):
```
{ sku, asin, name (short product name), pack ("2 Pack"/"60 Capsules"),
  fulfillable (afn-fulfillable-quantity), reserved (afn-reserved-quantity),
  inbound (sum of working + shipped + receiving),
  daily (avg daily units sold trailing 30d),
  dos (fulfillable / daily — fulfillable-only DOS),
  fullTitle (full Amazon listing title, hover tooltip) }
```
Masthead: `BRAND, MARKETPLACE, SNAPSHOT ("2026-05-07 · 14:48 UTC"), WINDOW ("30D · 04-07 → 05-07")`.

**Formeln/Tiers im Code:**
- `eff = (fulfillable + inbound) / daily` (Z. 61).
- Tiering (Z. 63–68): `eff < 2 → CRITICAL (oxblood)`, `< 7 → HIGH (amber)`, `< 14 → ELEVATED (olive)`, sonst **`SECURED (forest)`**.
- Default-Sort: `effectiveDos` aufsteigend (Z. 116). Stat-Kacheln: At-risk-Anzahl („Stock > 0 · DOS < 14d"), Critical <2d, High 2–7d, „Secured by inbound" (eff≥14) mit Summe Inbound-Units (Z. 130–133, 206–209).
- **DOS-Shift-Caption**: wenn `|eff − dos| > 0.5` wird der fulfillable-only-Wert durchgestrichen als „X.XXd w/o inbound" angezeigt (Z. 274, 336–340).
- **Reserved-Anomalie**: reserved wird amber eingefärbt wenn `reserved > fulfillable × 3` (Z. 311).
- Zeilen-Styling: eff<2 rot getönt; eff≥14 auf 72 % Deckkraft (Z. 280–281).
- Footer-Methodology wörtlich (Z. 357): „Effective DOS = (fulfillable + inbound) ÷ avg daily units (30d). Inbound = working + shipped + receiving. Tiering uses effective DOS." Caveats (Z. 364): „Reserved units are shown but not subtracted from fulfillable. Inbound assumes on-time arrival… MFN inventory is not included." Source (Z. 370): `sp_fba_inventory · sp_listings · sp_orders · 30-day trailing window`.

**SKILL.md-Regeln (fba-inventory-risk-dashboard/SKILL.md):**
- Kern-These (Z. 9): fulfillable-only DOS überzeichnet Risiko dramatisch — „2 Tage fulfillable + 900 inbound ist kein Brand; 5 Tage fulfillable + 0 inbound schon".
- At-Risk-Query wörtlich (Z. 31): Top 50 SKUs, fulfillable > 0 AND DOS < 14, trailing-30d-Runrate, Ausschluss 0-Stock und 0-Sales, Sort DOS aufsteigend. Query-Struktur bewusst: „filter → run rate definition → columns → exclusions → sort"; Retry-Kaskade bei Analyst-Fehlern (Z. 33–38). Enrichment als **ein** kombinierter Call (Titel + afn-Felder), Fallback zwei Calls; nie At-Risk+Enrichment in einem Call (Multi-Table-Joins fehleranfällig) (Z. 42–46). Titel-Dedupe per ASIN, erste non-null (Z. 48).
- **Kurznamen-Algorithmus** (Z. 52–60): Text vor erstem Komma oder erstem Gedankenstrich; „Official/Premium/ALL-CAPS-Markenpräfix" strippen; führende Pack-Klammer entfernen; Pack-Info aus schließender Klammer in eigenes `pack`-Feld; Ziel ~35 Zeichen; Volltitel als `fullTitle` erhalten.
- **Triage-Regeln** (Z. 64–72): echte Notfälle = eff DOS < 2 UND inbound = 0; Reorder-Kandidaten = eff DOS 2–7 UND inbound = 0; höchst-velocity SKU mit >14 Tagen inbound explizit als „phantom fire" entwarnen; reserved > 3× fulfillable namentlich nennen (gestrandete Bestände/Bulk-Order/Mapping-Bug); Pack-Cluster desselben Basisprodukts aufdecken (Hero-Pack hat inbound, Varianten-Packs oft nicht = Supplier-Pack-Strategie-Lücke). Headline 3–5 Sätze vor dem Artefakt.
- Populationsregel (Z. 81): **rohe Zahlen aus dem `data`-Feld nehmen, nie gerundete Display-Werte aus dem Antworttext.** SNAPSHOT aus `report_freshness.sp_fba_inventory.data_complete_through`.
- Varianten (Z. 100–106): already-stocked-out (Filter fulfillable>0 weg, Sort daily desc); Fenster 7d (heiß) / 90d (stabil); weiteres Netz DOS<30.
- **Aged-Inventory-Sektion** (Z. 108–144, komplett neu ggü. Kern-Analyse): Report `sp_fba_inventory_planning`; Age-Tiers 0–30 … **366–455 und 456+ (kein „365+"-Feld)**; Spalten `quantity-to-be-charged-ais-<tier>` und `estimated-ais-<tier>` für Tiers 181–210 bis 456-plus; `sell-through`, `days-of-supply`, `historical-days-of-supply`, `fba-minimum-inventory-level`, `fba-inventory-level-health-status` (Healthy/Low stock/Out of stock/Excess), Low-Inventory-Fee-Flags, `estimated-storage-cost-next-month`. Triage: Katalog-Gesamtsurcharge/Monat + schlechteste SKU zuerst; „paying now" (estimated-ais > 0) getrennt von „aging in soon" (**Units im 91–180-Tier > ~3 Monate t30-Velocity**); bei fee-exempten Sellern ist der Health-Status das Unter-Minimum-Signal, nicht die Fee-Spalte; **Removal-/Liquidations-Kandidat = geschätzter Sell-Through der Aged-Units > ~1 Jahr**. AWD ist in KEINEM Report — nur via `get_awd_inventory`.
- Caveats (Z. 146–156): Snapshot typ. **3–4 h alt**; nur FBA (MFN via `get_selling_partner_listings`); inbound = On-time-Annahme; 30d-Mittel unterschätzt Spike-Demand; **reserved = schwebende Kundenbestellungen, Abzug binnen 1–3 Tagen — bewusst nicht von fulfillable subtrahiert (kein Double-Count)**.
- Pitfalls (Z. 158–170): account_id = UUID, nicht `ATVPDKIKX0DER`; Marketplace immer bestätigen; keine Mega-Query; nie Roh-Titel in die Tabelle; nie fulfillable-only als Action-Signal.

### 3.3 Search Term Harvest Dashboard

**RAW-Schema wörtlich** (`search…/assets/dashboard-template.jsx:6–19`):
```
{ term, keyword (matched keyword text), match ("PHRASE"|"BROAD" — EXACT excluded by query),
  impressions, clicks (≥3 by filter), ctr (decimal), cost, sales (sales14d),
  buys (purchases14d; 0 = WATCH tier), acos (null when sales = 0),
  cvr (purchases14d / clicks), isNew (true when searchTerm ≠ keywordText — NEW reach) }
```
Masthead: `BRAND, MARKETPLACE ("US Ads"), SNAPSHOT, WINDOW, TOTAL_AD_SALES` (Zahl, z. B. 411965.76).

**Tier-Formel im Code** (Z. 55–61) — vollständiger als in der Kern-Analyse:
```
buys === 0                     → WATCH    (oxblood)
clicks >= 30 && acos <= 0.40   → PRIME    (forest)
clicks >= 10 && acos <= 0.55   → STRONG   (olive)
sonst                          → EMERGING (amber)
```
(acos-null wird als 999 behandelt, Z. 57.) Default-Sort: **`sales` absteigend** (Z. 132) — nicht CTR; SKILL.md:115 nennt das explizit als Pitfall („Defaulting sort to CTR… the decision ranks better by revenue"). Stat-Kacheln (Z. 147–151, 252–272): High-intent revenue (Σ sales, % von TOTAL_AD_SALES); „New harvest opportunities" = **isNew && buys > 0**; Prime-Count; Watch-Count. NEW/SAME-Badge; Reach-Filter-Pills all/new/same. Footer wörtlich (Z. 599–617): „Top 50 search terms by CTR matched by BROAD or PHRASE keywords. Floor: 100 impressions and 3 clicks. … PRIME needs ≥30 clicks and ACOS ≤ 40%." / „NEW = … harvesting as exact = new reach. SAME = … tightens bid control but doesn't expand reach." Source: `sponsored_products_search_terms · 14-day attribution`.

**SKILL.md-Regeln:** Scoping über `account_ids` (einzelnes Ads-Profil), **nie `brand_ids`** (würde Marktplätze mischen) (Z. 23). Datumsfenster: „heute minus 2 Tage" 30 Tage rückwärts (Report-Lag 1–3 Tage) (Z. 31). **Zwei kurze Analyst-Calls statt einem fetten** — Analyst droppt Row-Daten, wenn Rows+Aggregate in einem Call verlangt werden (Z. 27); Rows fehlen „roughly 1 in 3 times" → sofortiger Row-only-Nachcall (Z. 50–53). Query wörtlich (Z. 37–41): Top 50 nach CTR, matchType BROAD/PHRASE (EXACT raus), **≥100 Impressions und ≥3 Klicks** („no 1/2 = 50% noise"), Aggregation auf (searchTerm, keywordText, matchType, campaignName), Flag `searchTerm_equals_keyword` YES/NO, „Return as structured table data". Triage (Z. 56–63): Harvest-Impact **≥10 % der Ad-Sales = high-impact, <3 % = marginal**; Top-Revenue-Term namentlich; **PRIME < 5 Zeilen → ACOS-Schwelle auf ≤55 % lockern**; WATCH-Cluster um eine ASIN = PDP/Preis/Stock-Problem. Varianten (Z. 90–96): Sparse Accounts (<$10K/Monat Spend) → Floor auf **impressions ≥ 30 AND clicks ≥ 2** senken; nur-BROAD-Lauf für mehr NEW-Divergenz; Fenster <14 Tage riskant. Caveats (Z. 104–107): WATCH kann Attributions-Lag sein — nicht aggressiv killen; PRIME-Schwelle für Mid-Size-Accounts getuned; CVR unterschätzt bei High-AOV/langen Kaufzyklen; vor Bulk-Upload klären, ob ein anderes Tool die Kampagnen steuert. Next-Steps-Menü (Z. 81–84): Bulk-Upload-Datei (term+campaign+ad group+Bid aus avg_cpc) / Listing-Check bei WATCH-Cluster / BROAD-only-Rerun / andere Brand — **nur 1–2 anbieten**.

### 3.4 Wasted Ad Spend Dashboard

**RAW-Schema wörtlich** (`wasted…/assets/dashboard-template.jsx:7–16`):
```
{ term, campaign (top_campaign), impressions, clicks (≥5 by filter),
  cost (no rounding), ctr (decimal), cpc (cost/clicks),
  matches (string[]: distinct "EXACT"|"PHRASE"|"BROAD") }
```
Masthead: `BRAND, MARKETPLACE, SNAPSHOT, WINDOW, TOTAL_WASTED, TOTAL_SPEND, WORST_TERM`.

**Tier-Formel im Code** (Z. 53–57): `cost >= 100 → CRITICAL (oxblood)`, `>= 60 → HIGH (amber)`, sonst `ELEVATED (olive)`. Default-Sort `cost` desc. Stat-Kacheln (Z. 148–152, 248–268): Total wasted (% von TOTAL_SPEND); „Top 30 leakage" (Σ RAW, % von TOTAL_WASTED); **„Long-tail bleed" = max(0, TOTAL_WASTED − Σ Top30)**; Critical-Count ≥$100 mit WORST_TERM. MatchBadges farbcodiert EXACT=forest, PHRASE=olive, BROAD=amber (Z. 107–131). Footer wörtlich (Z. 550, 569–571): „Waste = clicks ≥ 5 AND purchases14d = 0. Aggregated at search-term level across all campaigns and match types." / Excluded: „<5 clicks (insufficient signal) and terms with any 14-day conversions (no matter how poor the ACOS). View shows top 30 by cost; total includes all qualifying terms."

**SKILL.md-Regeln:** Query wörtlich (Z. 35–39): purchases14d = 0 AND clicks ≥ 5, Aggregation nur auf searchTerm-Ebene (sonst „noisier dashboard"), Spalten inkl. top_campaign + match_types, Top 30 + Gesamt-Waste über ALLE qualifizierenden Terme. Triage-Benchmarks (Z. 52): Waste **<2 % vom Spend = gesund/informativ, 3–4 % = typisch für aktive Accounts, >5 % = echtes Geld — damit führen**. **Eigen-Marken-Terme mit 0 Conversions = „diagnostic gold": Listing/PDP/Preis/Stock-Problem, kein Keyword-Problem** (Z. 53). Long-Tail-Regel (Z. 54): Top 30 < 50 % des Gesamt-Waste → Bleed ist diffus, Negatives bewegen wenig. Wettbewerber-/Falschprodukt-Terme = einfache Negative-Wins (Z. 55). Variante „Near-zero" (Z. 85): `SUM(cost) > 50 AND (SUM(sales14d) = 0 OR cost/sales > 1.0)` für „where am I losing money". **Tier-Re-Anchoring** (Z. 110): Fix-Schwellen ($100/$60) sind für mittlere sechsstellige Monats-Spends; bei <$10K/Monat alles ELEVATED, bei >$1M alles CRITICAL → Angebot: Schwellen auf **0,1 % / 0,05 % / 0,025 % des Gesamt-Spends** re-ankern. WORST_TERM aus RAW-Zeile 1 ziehen, nie aus Prosa (Z. 108). Next Steps (Z. 74–77): Eigen-Marken-Terme → Listing-Audit („usually the bigger lever"); Wettbewerber-Terme → Bulk-Negative-Liste (Match-Typ aus `matches` ableiten); Waste niedrig/diffus → Harvest-Query als Inversansicht.

### 3.5 `amazon-reorder-planning/references/dashboard-pointers.md` (komplett)

Routing-Doku Skill↔Skill (einzige `references/`-Datei im Paket):
- **Trennlinie** (Z. 6–10): Reorder-Planning = *Entscheidung* („what do I buy and when") → Text/kompakte Tabelle; Inventory-Dashboard = *Zustand* („what's the situation right now") → interaktives Artefakt.
- Dashboard-Tells (Z. 12–18): „show me", „give me a view of", „what's running low", „all my SKUs at risk", explizit „dashboard/report/view", oder Nutzer hat schon entschieden und will nur monitoren → FBA-Dashboard-Skill vorschlagen, mit vorgegebener Phrasierung (Z. 21–23).
- Reorder-Tells (Z. 25–32): „what should I reorder", „draft a PO", „when do I need to order", „how much of X", „air freight", Lead-Times/MOQs/Suppliernamen.
- Beides (Z. 34–42): Sequenz Dashboard → Scope eingrenzen → Reorder auf Teilmenge. **„Don't try to do both jobs in one response… The dashboard wants to be interactive; the reorder plan wants to be auditable."**

### 3.6 Restliche harte Regeln/Zahlen aus den SKILL.md (Verifikations-Nachlese)

**amazon-reorder-planning/SKILL.md:**
- Basisformeln wörtlich (Z. 40–45): `lead-time demand = avg daily units × lead time`; `reorder point = lead-time demand + safety stock`; `order quantity = (target days of supply × avg daily units) − on-hand − inbound`.
- Fenster: 30d Standard; **60–90d für stabile Linien; 7–14d für heiße/saisonale SKUs** (Z. 48, 104). Lead-Times typ. 30–90 Tage international, 7–30 domestic/3PL (Z. 26). Service-Level-Optionen: X Tage Puffer oder 95/97,5/99 % In-Stock (Z. 29–30). **Ohne Lead-Time keine Empfehlung — nie Defaults erfinden** (Z. 34, 107).
- On-hand = FBA `fulfillable` + AWD `total_onhand_quantity`; inbound = FBA `working+shipped+receiving` + AWD `total_inbound_quantity`; **`inbound_working` nie droppen** (überzeichnet Stockout-Risiko); Vendor: `sellableOnHandUnits` + `openPurchaseOrderUnits` aus `sp_vendor_inventory` (Z. 49–50).
- **AWD-Doppelzähl-Falle** (Z. 51): `replenishment_quantity` (AWD→FBA-Transit) ist upstream von FBA-inbound_working — NICHT separat addieren, aber als eigene Spalte zeigen. **AWD = US-only, Integration-weit gescoped** — nur in den US-Plan einrechnen (Z. 53). `get_awd_inventory` immer aufrufen, meldet „not onboarded" sauber. `get_awd_replenishment_orders` liefert `distribution_ineligible_reasons` — „FBA leer, AWD voll" heißt meist Replenishment entblocken statt nachkaufen (Z. 18, 65).
- **Ads-Koordination** (Z. 79): Flag wenn `days of supply < (lead time + safety)` AND `ad spend > $50/Woche` → Bid-Pull oder Transfer; invers: gesunde SKUs mit wenig Spend = Budget-Headroom. Output: zwei Tabellen „Pull back / Pause ads" und „Push more ads".
- Vendor: Reorder-Signal = Amazons Mean-Forecast (4 Wochen) > sellableOnHand + openPO; **Gap > 50 % = Vendor-Manager-Outreach-Kandidat** (Z. 71, 99). PO-Draft: Tabelle SKU/ASIN/Cases/Units/Notes, keine Preise raten (Z. 87–93). **DOS < Lead-Time = schon zu spät → „Express/Air-Freight-Kandidat"** (Z. 114). Neue SKUs: nicht aus 5 Tagen Daten extrapolieren (Z. 113). Nie Marktplätze kombinieren (Z. 103).

**amazon-ads-optimization/SKILL.md:**
- **Five-Pillar-Framework** (Z. 15–21): Protect (Exact-Brand-Terms + Product-Page-Ads) / Conquer (Wettbewerber-ASINs) / Strengthen (Ranking-Kampagnen, down-only Bids) / Dominate (Single-Keyword-Exact, Fixed Bids für Heroes) / Discover (Auto/Broad/Phrase). Alle Säulen dauerhaft live, Monats-Review.
- Bid-to-Value (Z. 25–29): `Bid = Revenue-per-Click × Ziel-ACoS`, plus Min-Bid (Ranking hält) und Max-Bid (Overspend-Deckel); **Floor-Bids ~25 % anheben vor Hochsaison**.
- Negatives (Z. 33–37): gesunde Accounts haben **3–5× mehr Negatives als Positives**; **≥20 Klicks & 0 Orders → sofort Negative Exact**; monatlich N-Gram-Sheet gegen Low-Quality-Tokens (Bsp. „ceramic"); frisches Waste wöchentlich blocken, Voll-Audit monatlich; „negative sprint" monatlich bis Ratio erreicht (Z. 110–112).
- Wasted-Spend-Weekly (Z. 40–43): SP/SB/SD-Search-Term- & Matched-Target-Reports So–Sa. Health-Dashboard: 1 Sheet mit Weekly Spend/Sales/ACoS/% non-converting/Budget-Caps (Z. 47–51). Budget-Hygiene: Out-of-Budget-Filter täglich; **Top 20 % der Kampagnen dürfen nie cappen; monatlich vom Bottom-80 % umschichten** (Z. 54–56).
- **Saison-Playbook** (Z. 60–64): Keywords mit **≥2 Orders in 30 Tagen** identifizieren; **„Best"-Set: 3× Budget, bis 2× Bid; „Good"-Set: 2× Budget**; Rest normal; Modi All-Gas / Profit-Only / Hybrid; **2 Wochen vorher starten, Budgets am Tag locken, zurückdrehen wenn CVR normalisiert**.
- Strategische Moves (Z. 70–96): „All Gas No Brakes" (3× Budget, 2× Bid); „Profit Focus" (Budgets nur auf effiziente Kampagnen); Markt-vs-Ich-Pulse-Check (Category Insights/Opportunity Explorer/Brand Metrics **vor** Kampagnen-Änderungen); Minimum-Bid-Ranking-Kampagne; Hedgehog-Fokus (Hero-Keywords ins eigene Portfolio); 80/20-Pyramide; Q4-Exploration in separaten Discover-Kampagnen mit Max-Bid-Guardrails.
- Taktische Fixes (Z. 100–136): Min-Bid z. B. nie unter $1; **Black-Friday-Triage 30 Min.**: Business Reports statt Console (Lag), Top-Performer-Budgets zuerst, Out-of-Budget-Filter, Bids nur auf Ranking-Keywords; Budget-capped: **geschätzte Klicks × 2 (Holiday-Uplift)** als Mindest-Tagesbudget, mittags prüfen; neue Keyword-Sets in Test-Ad-Group mit **Max-Bid ~0,8× Kategorie-CPC**.
- Native Rules (Z. 140–176): `sp_optimization_rules` SCHEDULE (z. B. +50 % Wochenend-Abende 21–24 Uhr) / PERFORMANCE (z. B. +25 % bei ACOS < 20 %); **nur INCREMENT — Bids können per Regel nur steigen**; kein DELETE, nur `status` PAUSED/ENDED; Budget-Rules SP/SB/SD nur Erhöhung; Metriken: SB = IS/NTB/ROAS, SP/SD = ACOS/CTR/CVR/ROAS, SP-Optimization 10 Metriken; **Zeiten in Profil-Zeitzone**; Auto-Association via `campaignIds` im Create-Payload; SB-CPC-Cap (Beta) je 1 Kampagne via entityId.

**amazon-ads/SKILL.md:** Hierarchie Integration → Account/Profile (UUID + numerische profile_id) → Brand-Gruppierung; immer `whoami` → `list_brands` zuerst. Analyst-Fragen-Stil: explizites Datum, Metrikliste, Sort+Limit, Entitätstyp nennen (Z. 41–44). Ressourcen-Tabelle (Z. 71–85) inkl. DSP-Typen; **100 Items/Seite Cap**; `list_resources` kann NICHT nach Budget/Bid filtern → Analyst nutzen (Z. 161–166); Report-Daten mit Snapshot-Lag 2–3 Tage, Live-Werte via list_resources. Kampagnen-State nur ENABLED/PAUSED (kein ARCHIVED via API). ACOS = Spend/Sales × 100; 14-Tage-Attribution (`sales14d`, `purchases14d`).

**amazon-dsp/SKILL.md:** DSP nur auf Profilen mit `account_type=="agency"`; ohne Agency-Profil abbrechen, nichts fabrizieren (Z. 11–15). Drill-Down: advertisers → campaigns (advertiser_id) → ad_groups → targets (advertiser_id + ad_group_id); creatives auf Advertiser-Ebene (Z. 21–28). 6 Report-Typen (Z. 50–55): campaign_performance, products (Promoted vs **Halo** via `asinConversionType`, `featuredASIN` Y/N), campaign_creative, **geography (hat KEIN eCPM/eCPC/ROAS — client-side rechnen)**, **audience (nur SUMMARY, keine Zeitreihe, keine Purchase-Metriken)**, conversion_source. **NTB% = totalNewToBrandPurchases14d / totalPurchases14d; Prospecting-Line-Items = NTB > 40 %** (Z. 63, 86). Funnel-Gap-Heuristik: `dpv14d > 500` und `purchases < 10` → Line-Item-Ebene = Audience-Problem, ASIN-Ebene = Listing/Preis-Problem (Z. 92–94). „Order" ≈ Kampagne; Lag 1–3 Tage; nie Attribution-Fenster mischen (14d total vs 7d click).

**amazon-listing-audit/SKILL.md:** Severity-Triage Critical (Suppression-Risiko) > Warning (Discoverability/Conversion) > Info; immer mit Critical-Count führen (Z. 24–30). **RUFUS-3-Fragen** (Z. 40–43): „Is this right for me?" (Fit/Sizing/Kompatibilität/Audience) / „What's different?" / „How do I use it?". Benannte Checks: `rufus-bullets, bullet-formatting, bullet-prohibited-content, long-titles, hijacking-detection, prohibited-chars, title-prohibited-chars, amazon-issues, product-type-mismatch, missing-variations` + Search-Term-Check (`generic_keyword` — Hijacker-Lieblingsfeld, für Shopper unsichtbar). Banned-Claims-Beispiele: „FDA approved", „clinically proven", „eco-friendly", „antibacterial", „miracle cure" (Z. 58); Ersatzmuster „FDA approved" → „made in an FDA-registered facility" (Z. 121). **Hijacking-Signal: plötzlicher CVR-Drop ohne Preisänderung/Stockout → hijacking-detection VOR jeder anderen Hypothese** (Z. 54, 109). RUFUS-Rewrite: Bullets mit Score < 3 neu schreiben, immer mit `include_listing_data=true` und Before/After (Z. 86–87, 121). Batches 15–25 ASINs (Z. 134). Severity ≠ Urgency: Critical auf toter ASIN < Warning auf Top-Spend-ASIN (Z. 127). `amazon-issues` monatlich (zeigt Amazons eigene Flags, die im SC-UI oft fehlen).

**amazon-title-optimizer/SKILL.md:** Amazon zieht **75-Zeichen-Titellimit** durch; sonst kürzt Amazons AI selbst (strippt „Made in USA", Differenziatoren, Dose/Count/Size, Hero-Ingredient, Primärnutzen) (Z. 7–15). **14-Tage-Fenster nach Auto-Shorten, um eigene Version zu setzen — danach fix** (Z. 17). Drei Überlebensfragen (Z. 23–25): sucht der Käufer danach (SQP)? / erwähnen es Reviews (get_review_topics, sortiert nach Star-Rating-Impact)? / differenziert/qualifiziert es? Streichen: Füll-Adjektive („Premium/Advanced/Amazing/Ultimate"), Wiederholungen, redundante Brand-Nennungen (Z. 26). Priorisierung: höchster Umsatz/Spend zuerst (Z. 47–54). Tightening-Taktiken (Z. 70–75): Ziffern statt Worte, `&` statt „and", Artikel/Füllwörter raus, eine beweisende Zahl behalten. **Gestrichene Keywords umlagern in Bullets/Beschreibung/Backend — „Item Highlights"-Feld ist angekündigt, aber NICHT live in der API** (Z. 79). Update-Hinweise (Z. 84–87): `"ACCEPTED"` = queued, nicht approved; danach re-pullen; **nie Gewinner-Titel direkt vor Prime Day/BFCM ändern**; `update_listing` und Review-Tools sind **Seller-only** (Vendor: bei Schritt 3 stoppen, Vorschläge liefern); Review-Tools nur eigene brand-registrierte ASINs. **6 Kategorie-Playbooks** (Z. 94–116): Supplements Brand→Hero-Ingredient→Stärke(mg)→Count→Benefit→Form; Beauty Brand→Produkttyp→Hero-Ingredient→Skin-Concern→Größe→Format; Electronics Brand→Typ→Key-Spec→Kompatibilität→Modell-Nr.; Apparel Brand→Typ→Material→Fit→Audience (Farbe/Größe in die Variante, nicht Parent-Titel); Grocery Brand→Produkt→Flavor→Size/Count→Diät-Signal→Pack; Home/Kitchen Brand→Typ→Material/Kapazität→Key-Feature→Use-Case. Pitfall: Ein langer Parent-Titel wird oft von vielen Child-SKUs geteilt (FBM+FBA, jede Größe) — Familie fixen, nicht ein Kind (Z. 124).

**experiments/SKILL.md:** Lifecycle `proposed → started → complete` (+ dismissed mit Pflicht-Begründung — verbessert künftige Vorschläge); **MAP ändert nie automatisch etwas in Amazon** — Nutzer/Claude wendet an, Tracker beobachtet nur (Z. 10–15). Default-Fenster **14 Tage** (`planned_end_date` überschreibbar) (Z. 32). Tracker läuft **1× täglich** — frische Änderungen erscheinen erst morgen in `current_action` (Z. 63). `planned` ≠ `started` (kein Baseline-Snapshot) (Z. 62). Ergebnisse von `complete_experiment` **verbatim** teilen (Z. 40). Fehlermeldung „requires a current full-features plan" = Plan `ai_connect`/Trial abgelaufen; **Plan-Namen: two-week trial, Launch, Boost, Dominion** (Z. 65). Beispiel-Guardrails eines Bid-A/B-Tests (Z. 86): 30 %-ACOS-Early-Stop, 75 %-Sales-Floor. Kadenz: täglich „what's next", wöchentlich Proposals reviewen, Ende des Fensters abschließen.

**amazon-seller-central/SKILL.md:** Fragenkatalog je Report; harte Zahl: **Overstock = >90 Tage Supply** (Z. 17). Cross-Report-Insights (Z. 50–55): High-converting Search Terms + Low Stock = dringendes Reorder-Signal; Repeat-Purchase + Stockout-Risiko (Wiederkäufer-Verlust teurer als Erstkäufer); Fee-Burden auf Bestsellern; Slow Movers mit hohen Fees = Preis-/Delisting-Kandidaten. Vendor-Reports namentlich: `sp_vendor_sales` (ordered vs shipped, COGS, Returns), `sp_vendor_inventory` (sellableOnHand, weeksOfCover, aged, openPO), `sp_vendor_traffic` (glance views, Buy-Box-%), `sp_vendor_forecasting`, `sp_vendor_net_ppm` (Netto-Marge nach Kosten). Hinweis: Reports müssen heruntergeladen sein, bevor Daten verfügbar (Z. 96).

---

## 4. NEU / korrigiert gegenüber den Kern-Analysen

### Quelle A (ggü. SALVAGE.md §2 + knowledge/inputs.md)

1. **Komplettes IST-Prozess-Zeitmodell erstmals extrahiert** — 55–65 Min./Content mit Schrittzeiten, Rollen (Sales-MA, Fulfillment-MA, dedizierter Retailer-Projektplaner, Projektleitung) und quantifizierten Pain-Points (Voice&Tone fehlt ~90 %, 100–200 Keywords/Export, 4–5 Wettbewerber, 6 Hauptkeywords, Cerebro-Filter „nur organisch + ≥2 auf Seite 1"). `prozesse/seo-content-workflow.md:47–225`.
2. **SLA-/Produktisierungs-Zahlen neu:** 3 Werktage Erstlieferung, 1 Korrekturschleife inkl., ≤1 Werktag Korrektur/Upload, +0,5 Tage pro Farbvariante, 48h-Reminder, Kapazitätstabelle 15–30/30–60/60–100+ pro MA, 8→16 Contents/Tag, Priorisierung P1–P4 (Launch <5 Tage = P1), Batch ab >10 Produkten (30–40 % Ersparnis). `massnahmenplan.md:214–297`.
3. **Eskalationsleiter + „5-von-6"-Production-Ready-Regel neu** (48h Reminder+Sales, 5 Tage Projektleitung; Quick-Check-Katalog). `checklisten/kunden-onboarding.md:68–92`.
4. **Peer-Review-Regeln neu:** ab 20 Contents/Monat jeder 5. reviewed; neue MA 100 %-Review bis Schnitt >85 %. `massnahmenplan.md:191–194`.
5. **QA-Bugs bestätigt und präzisiert:** A2-Bug exakt lokalisiert (`qa-checks.ts:61–66`, Oder-Bedingung immer wahr → 0 unerreichbar); „leeres Listing = 23/40" nachgerechnet (A 5 + B 4 + C 6 + D 8); **zusätzlich neu:** A4 prüft weder Duplikate noch 249-Byte-Limit (nur Existenz, Z. 90–102); B4 prüft nur das erste Wort statt „ALL-CAPS-Keyword" (Z. 151–163); B1 vergibt 1 Punkt für jeden nicht-leeren Titel (Z. 123); Referenz-Hauptkeyword für B1 ist implizit das volumenstärkste (SQL-Sortierung, `generate/route.ts:42`).
6. **buildPrompt-Details neu:** Titel-Formatvorgabe wörtlich `HAUPTKEYWORD - Marke - Kernvorteil - weitere Keywords`; „weitere Keywords" auf 30 gekappt; **Backend-Limit im Prompt = 249 Bytes** (nicht 250 — deckt sich mit Amazons realem Limit; Differenz zur 250B-Angabe in SALVAGE §7 merken); Marker-Format `[TITEL]…[BACKEND]` mit Regex-Parser statt JSON. `api/content/generate/route.ts:119–230`.
7. **Betriebskosten/Modell neu:** claude-sonnet-4-20250514, max_tokens 4000, ~$0.01–0.03 pro Generierung, 15–30 s UI-Erwartung (`einstellungen/page.tsx:40–47`, `generate/route.ts:62–66`). Turso als Vercel-DB, lokaler SQLite-Fallback (`db.ts:5–19`); keine Auth.
8. **CSV-Autodetect-Spaltennamen wörtlich** (inkl. `Estimated Exact Search Volume`) — nützlich als Parser-Referenz für unseren H10-Import. `produkte/[id]/keywords/page.tsx:61–76`.
9. **Status-Maschine präzisiert:** nur `neu→keywords` ist konditional; content/qa werden bedingungslos gesetzt; `fertig` UI-seitig hinter dem 32-Punkte-Gate. (SALVAGE nannte die State-Machine, nicht die Gates.)

### Quelle B (ggü. SALVAGE.md §6)

1. **Tier-Systeme vervollständigt:** Harvest hat **4 Tiers** — zusätzlich zu PRIME/STRONG (Kern-Analyse) existieren **EMERGING** (Default, amber) und **WATCH** (buys=0, oxblood, „nicht aggressiv killen — Attributions-Lag"); acos=null zählt als 999. `search…/dashboard-template.jsx:55–61`. FBA hat 4. Tier **SECURED** (eff ≥ 14, „Secured by inbound"). `fba…/dashboard-template.jsx:63–68`.
2. **RAW-Datenkontrakte + Masthead-Konstanten wörtlich gesichert** (Abschn. 3.2–3.4) — inkl. der Nebenregeln: Populieren nur aus dem `data`-Feld (nie gerundete Prosa-Werte), WORST_TERM aus RAW[0], `isNew` aus dem YES/NO-Flag berechnen statt aus Prosa.
3. **Template-Eigenlogik neu dokumentiert:** DOS-Shift-Caption (|eff−dos|>0.5 → durchgestrichenes „w/o inbound"), Reserved-Anomalie-Färbung bei reserved > 3× fulfillable, Long-tail-bleed-Ableitung `TOTAL_WASTED − ΣTop30`, Default-Sorts (eff-DOS asc / sales desc / cost desc — Harvest bewusst NICHT nach CTR).
4. **Waste-Benchmark verfeinert:** Kern-Analyse hatte <2 %/>5 %; neu: **3–4 % typisch**; Long-Tail-Regel (Top 30 < 50 % → Negatives bewegen wenig); **Tier-Re-Anchoring 0,1/0,05/0,025 % des Spends** für unter-/übergroße Accounts; „Near-zero"-Variante (`cost>50 AND (sales=0 OR ACOS>1.0)`). `wasted…/SKILL.md:52–54, 85, 110`.
5. **Harvest-Kalibrierung neu:** Sparse-Account-Floor (impressions ≥30, clicks ≥2 bei <$10K/Monat); PRIME-Lockerung auf ACOS ≤55 % bei <5 PRIME-Zeilen; Impact-Skala ≥10 %/<3 % der Ad-Sales; Fenster „heute−2 Tage" wegen 1–3-Tage-Lag; „zwei kurze Calls statt ein fetter". `search…/SKILL.md:21–63, 90–96`.
6. **Aged-Inventory-Wissen komplett neu** (fehlte in Kern-Analyse): Report `sp_fba_inventory_planning`, Age-Tiers bis 456+ (kein „365+"), AIS-Spalten 181-210…456-plus, Health-Status als Signal für fee-exempte Seller, „aging in soon" = 91–180-Tier > ~3 Monate t30-Velocity, Removal-Kandidat = Sell-Through > ~1 Jahr. `fba…/SKILL.md:108–144`.
7. **FBA-Dashboard-Betriebsregeln neu:** Kurznamen-Extraktionsalgorithmus (~35 Zeichen, 5 Schritte), Titel-Dedupe per ASIN, Triage-Kategorien (echte Notfälle vs. Reorder-Kandidaten vs. Phantom-Fires vs. Pack-Cluster), Caveat „reserved wird bewusst nicht subtrahiert (1–3-Tage-Overhang)", Snapshot 3–4 h alt, account_id-UUID-Falle. `fba…/SKILL.md:52–72, 146–170`.
8. **dashboard-pointers.md inhaltlich erschlossen** (Kern-Analyse erwähnte nur die Existenz): Entscheidung-vs.-Zustand-Trennlinie, wörtliche Weiterleitungs-Phrasierung, Sequenz-Workflow „Dashboard → Scope → Reorder", „interactive vs. auditable"-Prinzip — gutes Muster für unsere eigene Skill-/Modul-Abgrenzung (z. B. Audit-Ansicht vs. Content-Generierung).
9. **Reorder-Regeln ergänzt:** Air-Freight-Regel (DOS < Lead-Time = schon zu spät); Ads-Koordinations-Schwelle ($50/Woche); Vendor-Outreach bei Forecast-Gap >50 %; Demand-Fenster je SKU-Typ (60–90d stabil / 7–14d heiß); „nie aus 5 Tagen Daten extrapolieren"; AWD US-only + Integration-weit. `amazon-reorder-planning/SKILL.md:48–116`.
10. **Ads-Playbook-Zahlen ergänzt:** „Best"-Set 3× Budget/2× Bid vs. „Good"-Set 2× Budget; Budget-capped-Formel Klicks×2; Test-Ad-Group-Max-Bid 0,8× Kategorie-CPC; Min-Bid-Beispiel $1; Black-Friday-30-Min-Triage; Native-Rules-Constraints (nur INCREMENT, kein DELETE, Metrik-Sets je Kampagnentyp, Profil-Zeitzone); `list_resources` kann nicht nach Bid/Budget filtern; Kampagnen-State nur ENABLED/PAUSED. `amazon-ads-optimization/SKILL.md:60–176`, `amazon-ads/SKILL.md:118–166`.
11. **DSP-Detailregeln ergänzt:** Geography-Report ohne ROAS/eCPM/eCPC (client-side rechnen); Audience-Report SUMMARY-only; Halo-vs-Promoted + featuredASIN; Funnel-Gap-Schwellen dpv14d>500 & purchases<10; Creatives auf Advertiser-Ebene. `amazon-dsp/SKILL.md:50–121`.
12. **Titel-Optimizer ergänzt:** „Item Highlights"-Feld angekündigt, aber nicht live in der API (Überlauf-Keywords bis dahin in Bullets/Backend); ACCEPTED=queued; Vendor-Grenzen (update_listing & Review-Tools Seller-only); Event-Freeze-Regel; alle 6 Kategorie-Playbooks (Kern-Analyse hatte nur Supplements). `amazon-title-optimizer/SKILL.md:79–116`.
13. **Experiments ergänzt:** MAP-Plan-Namen (two-week trial, Launch, Boost, Dominion; `ai_connect` ohne Experiments), 14-Tage-Default-Fenster, 1×-täglich-Tracker, Dismiss-Reason als Lernsignal, Beispiel-Guardrails (30 %-ACOS-Early-Stop, 75 %-Sales-Floor). `experiments/SKILL.md:32–86`.
14. **Bestätigt (keine Korrektur nötig):** Waste-Definition clicks≥5 & purchases14d=0 mit $100/$60-Tiers; Harvest-Filter BROAD/PHRASE + 100 Imp/3 Klicks; „~1 von 3 Analyst-Calls droppt Rows"; NTB>40 %; Format-Lehre (nur `description`-Frontmatter, Workflows/Pitfalls/Tips-Struktur); Google-Fonts-Injection und dreifach kopierte Palette als Anti-Patterns.
