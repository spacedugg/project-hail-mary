CREATE TABLE "conversion_drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"data_basis" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversion_drivers" ADD CONSTRAINT "conversion_drivers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;