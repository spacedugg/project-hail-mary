CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_id" text,
	"scope" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'listing-analyse' NOT NULL,
	"uplift_eur" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"voice_tone" text,
	"margin_pct" double precision,
	"kind" text DEFAULT 'brand' NOT NULL,
	"publish_nur_mit_kundenfreigabe" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"rolle" text,
	"password_hash" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "competitor_info_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"data_basis" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"asin" text NOT NULL,
	"source" text NOT NULL,
	"title" text,
	"bullets" jsonb,
	"description" text,
	"attributes" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_id" text NOT NULL,
	"art" text NOT NULL,
	"slot" text,
	"schwere" text DEFAULT 'mittel' NOT NULL,
	"nachricht" text NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"erledigt_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_id" text NOT NULL,
	"snapshot_id" text,
	"ergebnis" jsonb NOT NULL,
	"accuracy_pct" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_id" text NOT NULL,
	"slot" text NOT NULL,
	"anker_index" integer,
	"content_version_id" text,
	"piece_id" text,
	"autor_typ" text NOT NULL,
	"autor_name" text NOT NULL,
	"autor_user_id" text,
	"autor_contact_id" text,
	"share_id" text,
	"art" text DEFAULT 'kommentar' NOT NULL,
	"nachricht" text NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"erledigt_von" text,
	"erledigt_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pieces" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_id" text NOT NULL,
	"marketplace" text DEFAULT 'de' NOT NULL,
	"slot" text NOT NULL,
	"wert" text,
	"werte" jsonb,
	"quelle" text DEFAULT 'manuell' NOT NULL,
	"status" text DEFAULT 'entwurf' NOT NULL,
	"notiz" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"product_id" text,
	"weg" text NOT NULL,
	"payload" jsonb,
	"slots" jsonb NOT NULL,
	"status" text DEFAULT 'erzeugt' NOT NULL,
	"hinweise" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"token" text NOT NULL,
	"contact_id" text,
	"label" text NOT NULL,
	"product_ids" jsonb,
	"darf_freigeben" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"validation" jsonb,
	"generated_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"sent_to_client_at" timestamp with time zone,
	"sent_share_id" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversion_blockers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"data_basis" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"data_basis" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_rankings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"data_basis" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flatfile_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"file_name" text NOT NULL,
	"sheet_name" text,
	"header_rows" jsonb NOT NULL,
	"field_names" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"keyword" text NOT NULL,
	"search_volume" integer,
	"tier" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"ausgeschlossen" boolean DEFAULT false NOT NULL,
	"ausschluss_grund" text,
	"meta" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text,
	"bullets" jsonb,
	"description" text,
	"image_urls" jsonb,
	"reviews_total" integer,
	"rating_avg" double precision,
	"rating_dist" jsonb,
	"attributes" jsonb,
	"important_info" text,
	"aplus_content" text,
	"bilder_text" jsonb,
	"bild_befunde" jsonb,
	"raw" jsonb,
	"created_at" timestamp with time zone NOT NULL
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
	"marke" text,
	"marketplace" text DEFAULT 'de' NOT NULL,
	"name" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" integer,
	"margin_calc" jsonb,
	"zusatz_kontext" text,
	"content_sprache" text DEFAULT 'de' NOT NULL,
	"sku" text,
	"amazon_product_type" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qm_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"bereich" text NOT NULL,
	"findings" jsonb NOT NULL,
	"versuche" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"marketplace" text DEFAULT 'de' NOT NULL,
	"report_type" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"file_name" text NOT NULL,
	"parsed" jsonb,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"parse_error" text,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"scrape_id" text,
	"data_basis" text NOT NULL,
	"confidence" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_scrapes" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"source" text DEFAULT 'apify' NOT NULL,
	"asins" jsonb NOT NULL,
	"reviews" jsonb NOT NULL,
	"star_counts" jsonb NOT NULL,
	"per_asin" jsonb NOT NULL,
	"amazon_totals" jsonb,
	"notes" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_info_gaps" ADD CONSTRAINT "competitor_info_gaps_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_listings" ADD CONSTRAINT "competitor_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_alerts" ADD CONSTRAINT "content_alerts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_alerts" ADD CONSTRAINT "content_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_snapshot_id_listing_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."listing_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_piece_id_content_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_autor_user_id_users_id_fk" FOREIGN KEY ("autor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_autor_contact_id_client_contacts_id_fk" FOREIGN KEY ("autor_contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_share_id_content_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."content_shares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_shares" ADD CONSTRAINT "content_shares_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_shares" ADD CONSTRAINT "content_shares_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_blockers" ADD CONSTRAINT "conversion_blockers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_audits" ADD CONSTRAINT "deep_audits_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_rankings" ADD CONSTRAINT "feature_rankings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flatfile_templates" ADD CONSTRAINT "flatfile_templates_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "public"."product_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qm_blocks" ADD CONSTRAINT "qm_blocks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_uploads" ADD CONSTRAINT "report_uploads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_insights" ADD CONSTRAINT "review_insights_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_insights" ADD CONSTRAINT "review_insights_scrape_id_review_scrapes_id_fk" FOREIGN KEY ("scrape_id") REFERENCES "public"."review_scrapes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_scrapes" ADD CONSTRAINT "review_scrapes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_client_email" ON "client_contacts" USING btree ("client_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pieces_product_slot_mp" ON "content_pieces" USING btree ("product_id","slot","marketplace");--> statement-breakpoint
CREATE UNIQUE INDEX "content_shares_token" ON "content_shares" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_asin_mp" ON "products" USING btree ("brand_id","asin","marketplace");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");