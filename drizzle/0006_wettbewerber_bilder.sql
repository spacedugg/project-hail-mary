-- Wettbewerber-Bilder (D276): Die Bild-URLs kamen beim Listing-Scrape der
-- Vergleichs-ASINs immer schon mit und wurden weggeworfen. Jetzt gespeichert
-- und per Vision ausgelesen — dieselbe Struktur wie listing_snapshots.bilder_text.
-- bilder_text NULL = noch nicht ausgelesen, [] = ausgelesen ohne Fund.
ALTER TABLE "competitor_listings" ADD COLUMN IF NOT EXISTS "image_urls" jsonb;--> statement-breakpoint
ALTER TABLE "competitor_listings" ADD COLUMN IF NOT EXISTS "bilder_text" jsonb;
