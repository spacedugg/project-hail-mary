CREATE TABLE "bild_briefings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"sprache" text DEFAULT 'de' NOT NULL,
	"payload" jsonb NOT NULL,
	"hinweise" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bild_briefings" ADD CONSTRAINT "bild_briefings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;