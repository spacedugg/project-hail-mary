# Tool ohne Terminal nutzen — Klick-Anleitung

> Für die interne Nutzung ohne jede Kommandozeile. Alles läuft über Browser-Oberflächen (GitHub → Vercel → Turso), genau wie bei den anderen Temoa-Tools (Sales Room läuft bereits auf Turso).

## Einmalige Einrichtung (ca. 10 Minuten, nur Klicks)

### 1. Turso-Datenbank anlegen
1. [turso.tech](https://turso.tech) → einloggen → **Create Database** (Region Frankfurt/AMS).
2. In der Datenbank-Übersicht: **URL kopieren** (beginnt mit `libsql://…`).
3. **Create Token** (Read & Write) → Token kopieren.

### 2. Vercel-Projekt anlegen
1. [vercel.com](https://vercel.com) → **Add New… → Project**.
2. GitHub-Repo **`spacedugg/project-hail-mary`** auswählen → **Import**.
3. Branch ggf. auf `claude/amazon-listing-analysis-tool-u3uety` stellen (bis zum Merge auf main).
4. Framework wird automatisch als Next.js erkannt — nichts ändern.

### 3. Umgebungsvariablen (Vercel → Settings → Environment Variables)
| Variable | Wert / Wofür | Ohne sie |
|---|---|---|
| `TURSO_DATABASE_URL` | die `libsql://…`-URL aus Schritt 1 | **Pflicht** — Serverless speichert sonst nichts dauerhaft |
| `TURSO_AUTH_TOKEN` | der Token aus Schritt 1 | Pflicht zusammen mit der URL |
| `ANTHROPIC_API_KEY` | Text-Generierung (Claude) | Mock-Texte (deterministische Templates) |
| `APIFY_API_KEY` | Review-Scraping | Review-Insights nur als Mock |

### 4. Deploy
**Deploy**-Button klicken. Fertig — die App läuft unter `…vercel.app`, erreichbar von jedem Gerät. Jeder Push auf den Branch deployt automatisch neu. Datenbank-Migrationen laufen automatisch beim ersten Aufruf.

## Danach: der tägliche Ablauf (alles im Browser)

1. **Katalog** → Kunde anlegen → Produkt mit ASIN anlegen.
2. **Produkt-Wahrheit** + **Keywords** eintragen (oder Cerebro-CSV bei 2b hochladen).
3. **2c Review-Insights**: Wettbewerber-ASINs eintragen → „Reviews analysieren".
4. **3 Content**: Sektion für Sektion generieren (Titel → Bullets → Item Highlights → Backend → Beschreibung → Q&A) — Gate-Befunde, Zeichenzähler + Begründung erscheinen direkt darunter.
5. **„Analyse öffnen"** → präsentationsfertige Kunden-Analyse (inkl. „Warum diese Texte") + Bild-/A+-Brief zum Kopieren.

## Hinweise
- Die Keys liegen NUR in Vercel (serverseitig), nie im Code oder Browser.
- Turso-Dashboard zeigt die Daten live (Tabellen: clients, brands, products, keywords, content_versions, review_insights, report_uploads).
