# Tool ohne Terminal nutzen — Klick-Anleitung

> Für die interne Nutzung ohne jede Kommandozeile. Alles läuft über Browser-Oberflächen (GitHub → Vercel → Supabase), genau wie bei den anderen Temoa-Tools.

## Einmalige Einrichtung (ca. 10 Minuten, nur Klicks)

### 1. Vercel-Projekt anlegen
1. [vercel.com](https://vercel.com) → **Add New… → Project**.
2. GitHub-Repo **`spacedugg/project-hail-mary`** auswählen → **Import**.
3. Branch ggf. auf `claude/amazon-listing-analysis-tool-u3uety` stellen (bis zum Merge auf main).
4. Framework wird automatisch als Next.js erkannt — nichts ändern.

### 2. Supabase-Datenbank verbinden
1. [supabase.com](https://supabase.com) → **New Project** (Region Frankfurt).
2. Im Projekt: **Settings → Database → Connection String → URI** kopieren (die „Transaction pooler"-Variante).
3. In Vercel: **Settings → Environment Variables** → `DATABASE_URL` = eingefügter Wert.

### 3. API-Keys hinterlegen (Vercel → Settings → Environment Variables)
| Variable | Wofür | Ohne sie |
|---|---|---|
| `DATABASE_URL` | Supabase-Datenbank | App speichert nicht dauerhaft (Serverless!) — **Pflicht fürs Deployment** |
| `ANTHROPIC_API_KEY` | Text-Generierung (Claude) | Mock-Texte (deterministische Templates) |
| `APIFY_API_KEY` | Review-Scraping | Review-Insights nur als Mock |

### 4. Deploy
**Deploy**-Button klicken. Fertig — die App läuft unter `…vercel.app`, erreichbar von jedem Gerät. Jeder Push auf den Branch deployt automatisch neu.

## Danach: der tägliche Ablauf (alles im Browser)

1. **Katalog** → Kunde anlegen → Produkt mit ASIN anlegen.
2. **Produkt-Wahrheit** + **Keywords** eintragen (oder Cerebro-CSV bei 2b hochladen).
3. **2c Review-Insights**: Wettbewerber-ASINs eintragen → „Reviews analysieren".
4. **3 Content**: Sektion für Sektion generieren — Gate-Befunde + Begründung erscheinen direkt darunter.
5. **„Analyse öffnen"** → präsentationsfertige Kunden-Analyse + Bild-/A+-Brief zum Kopieren.

## Hinweise
- Migrationen laufen automatisch beim ersten Aufruf — kein manueller Schritt.
- Die Keys liegen NUR in Vercel (serverseitig), nie im Code oder Browser.
