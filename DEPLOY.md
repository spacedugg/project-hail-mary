# Tool ohne Terminal nutzen — Klick-Anleitung

> Für die interne Nutzung ohne jede Kommandozeile. Alles läuft über Browser-Oberflächen (GitHub → Vercel → Supabase). Die Datenbank ist EINE gemeinsame Online-DB (Supabase/Postgres) — alle Personen, Geräte und Sessions sehen denselben Stand; nichts liegt offline oder nur für eine Person einsehbar (D221).

## Einmalige Einrichtung (ca. 10 Minuten, nur Klicks)

### 1. Supabase-Datenbank anlegen
1. [supabase.com](https://supabase.com) → einloggen → **New Project** (Region Frankfurt/EU-Central). Ein DB-Passwort vergeben und sicher notieren.
2. Projekt öffnen → **Project Settings → Database → Connection string** → Reiter **Transaction pooler** wählen (Port `6543`) → die URL kopieren und das Passwort einsetzen. Sie sieht so aus: `postgresql://postgres.<ref>:<PASSWORT>@aws-…-eu-central-1.pooler.supabase.com:6543/postgres`.

### 2. Vercel-Projekt anlegen
1. [vercel.com](https://vercel.com) → **Add New… → Project**.
2. GitHub-Repo **`spacedugg/project-hail-mary`** auswählen → **Import**.
3. Branch ggf. auf `claude/amazon-listing-analysis-tool-u3uety` stellen (bis zum Merge auf main).
4. Framework wird automatisch als Next.js erkannt — nichts ändern.

### 3. Umgebungsvariablen (Vercel → Settings → Environment Variables)
| Variable | Wert / Wofür | Ohne sie |
|---|---|---|
| `DATABASE_URL` | die Transaction-Pooler-URL aus Schritt 1 (mit eingesetztem Passwort) | **Pflicht** — ohne sie startet die App nicht (kein lokaler Fallback mehr) |
| `ANTHROPIC_API_KEY` | Text-Generierung (Claude) | Mock-Texte (deterministische Templates) |
| `APIFY_API_KEY` | Review-Scraping | Review-Insights nur als Mock |
| `AUTH_SECRET` | Signatur der Login-Sitzungen — **beliebige lange Zufallszeichenfolge** (z. B. in Vercel beim Feld auf „Generate" klicken oder einen Passwort-Manager 40+ Zeichen erzeugen lassen; niemals im Chat posten) | Logins nur dev-signiert (Demo-Banner warnt) |

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
- Supabase → **Table Editor** zeigt die Daten live (Tabellen: clients, brands, products, keywords, content_versions, review_insights, report_uploads …).
- Die Tabellen legt die App beim ersten Aufruf automatisch an (Migrationen laufen selbsttätig).
