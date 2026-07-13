CREATE TYPE "public"."content_status" AS ENUM('draft', 'approved', 'synced');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('title', 'bullets', 'description', 'backend_keywords');--> statement-breakpoint
CREATE TYPE "public"."keyword_tier" AS ENUM('primary', 'secondary', 'tertiary', 'backend', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."marketplace" AS ENUM('de', 'uk', 'fr', 'it', 'es', 'nl', 'us');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"voice_tone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"type" "content_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"validation" jsonb,
	"generated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"keyword" text NOT NULL,
	"search_volume" integer,
	"tier" "keyword_tier",
	"source" text DEFAULT 'manual' NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_group_id" text,
	"asin" text,
	"marketplace" "marketplace" DEFAULT 'de' NOT NULL,
	"name" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"marketplace" "marketplace" DEFAULT 'de' NOT NULL,
	"report_type" text NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"file_name" text NOT NULL,
	"parsed" jsonb,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"parse_error" text,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"data_basis" text NOT NULL,
	"confidence" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "public"."product_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_uploads" ADD CONSTRAINT "report_uploads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_insights" ADD CONSTRAINT "review_insights_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_asin_mp" ON "products" USING btree ("brand_id","asin","marketplace");