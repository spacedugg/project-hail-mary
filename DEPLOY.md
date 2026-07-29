# Tool ohne Terminal nutzen — Klick-Anleitung

> Für die interne Nutzung ohne jede Kommandozeile. Alles läuft über Browser-Oberflächen (GitHub → Vercel → Supabase).

## Einmalige Einrichtung (ca. 10 Minuten, nur Klicks)

### 1. Supabase-Datenbank anlegen
1. [supabase.com](https://supabase.com) → einloggen → **New Project**.
2. **Region: Central EU (Frankfurt)**. Das Datenbank-Passwort dabei **sofort in den Passwort-Manager** — es wird nur einmal angezeigt.
3. Unter **Security** (D262):
   - **Enable Data API** → **aus**. Wir sprechen Postgres nur serverseitig über Drizzle an; ohne Data API antwortet kein generierter REST-Endpunkt, egal welcher Key im Umlauf ist. Das ersetzt Row Level Security, die bei einer Direktverbindung als Tabellen-Eigentümer ohnehin umgangen würde.
   - **Enable automatic RLS** → **an**. Reiner Notriegel: Sollte die Data API je aktiviert werden, sind alle Tabellen sofort dicht statt offen.
4. Nach dem Provisionieren: **Connect** → **Direct Connection string** → **Transaction pooler** → **URI** kopieren und `[YOUR-PASSWORD]` ersetzen. Port muss **6543** sein (nicht 5432 — Serverless braucht den Pooler).

### 2. Vercel-Projekt anlegen
1. [vercel.com](https://vercel.com) → **Add New… → Project**.
2. GitHub-Repo **`spacedugg/project-hail-mary`** auswählen → **Import**.
3. Framework wird automatisch als Next.js erkannt — nichts ändern.
4. **Settings → Functions → Function Region → Frankfurt (fra1)** setzen. Sonst laufen die Funktionen in Washington und jede DB-Abfrage geht über den Atlantik.

### 3. Umgebungsvariablen (Vercel → Settings → Environment Variables)
| Variable | Wert / Wofür | Ohne sie |
|---|---|---|
| `DATABASE_URL` | der Connection String aus Schritt 1.4 (`postgresql://postgres.<ref>:<PASSWORT>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`) | **Pflicht** — die App startet nicht |
| `ANTHROPIC_API_KEY` | Text-Generierung (Claude) | Mock-Texte (deterministische Templates) |
| `APIFY_API_KEY` | Review-Scraping | Review-Insights nur als Mock |
| `AUTH_SECRET` | Signatur der Login-Sitzungen — **beliebige lange Zufallszeichenfolge** (z. B. in Vercel beim Feld auf „Generate" klicken oder einen Passwort-Manager 40+ Zeichen erzeugen lassen; niemals im Chat posten) | Logins nur dev-signiert (Demo-Banner warnt) |

> TLS für die DB-Verbindung erzwingt der Code (`ssl: "require"` in `src/db/client.ts`) — sie kann beim Kopieren der URL also nicht verloren gehen. Nur falls ein Pooler-Endpunkt sie verweigert, gibt es den Notausgang `DATABASE_SSL=off`.

> **Anmeldung:** Nach dem Deploy öffnet sich die Login-Seite. Jedes Agentur-Mitglied legt sein Konto selbst an („Konto anlegen") — das **erste Konto wird automatisch Admin**. Profil, Passwort & Team-Übersicht unter *Einstellungen* (Zahnrad unten in der Seitenleiste).

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
- Das Supabase-Dashboard zeigt die Daten live (**Table Editor** bzw. **SQL Editor**) — 27 Tabellen, u. a. clients, brands, products, keywords, content_versions, content_pieces, review_insights, report_uploads.
- **Nach dem Deploy prüfen:** `…vercel.app/api/health` aufrufen. `{"ok":true,"db":"reachable","migrationsOk":true,…}` heißt: Verbindung steht und die Migration ist durchgelaufen. Bei `ok:false` steht die Ursache in der Meldung.
