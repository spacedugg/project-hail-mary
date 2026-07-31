CREATE TABLE "insights_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"token" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insights_reports" ADD CONSTRAINT "insights_reports_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insights_reports_token" ON "insights_reports" USING btree ("token");