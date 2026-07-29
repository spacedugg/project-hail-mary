CREATE TABLE "amazon_connection_brands" (
	"connection_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"label" text,
	"selling_partner_id" text,
	"region" text DEFAULT 'eu' NOT NULL,
	"encrypted_refresh_token" text,
	"token_fingerprint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"authorized_at" timestamp with time zone,
	"reauthorization_due_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_code" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_marketplaces" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"marketplace_id" text NOT NULL,
	"country_code" text NOT NULL,
	"name" text NOT NULL,
	"default_currency" text,
	"default_language" text,
	"is_participating" boolean DEFAULT false NOT NULL,
	"has_suspended_listings" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"state_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"brand_id" text,
	"connection_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"amazon_request_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_connection_brands" ADD CONSTRAINT "amazon_connection_brands_connection_id_amazon_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."amazon_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_connection_brands" ADD CONSTRAINT "amazon_connection_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_connections" ADD CONSTRAINT "amazon_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_marketplaces" ADD CONSTRAINT "amazon_marketplaces_connection_id_amazon_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."amazon_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_oauth_states" ADD CONSTRAINT "amazon_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_oauth_states" ADD CONSTRAINT "amazon_oauth_states_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_oauth_states" ADD CONSTRAINT "amazon_oauth_states_connection_id_amazon_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."amazon_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_connection_id_amazon_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."amazon_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_connection_brands_pk" ON "amazon_connection_brands" USING btree ("connection_id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_connections_client_spid_region" ON "amazon_connections" USING btree ("client_id","selling_partner_id","region");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_marketplaces_conn_mp" ON "amazon_marketplaces" USING btree ("connection_id","marketplace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_oauth_states_hash" ON "amazon_oauth_states" USING btree ("state_hash");