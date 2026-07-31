-- Werk-Auswahl (D270): welche Werke für ein Produkt überhaupt entstehen sollen.
-- NULL = keine Entscheidung ⇒ Standard (nur Listing-Texte). Bestandsprodukte
-- behalten damit ihre laufende Listing-Kette; A+ Basic, A+ Premium und
-- Brand-Store sind ab jetzt aus, bis sie ausgewählt werden.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "werke_plan" jsonb;
