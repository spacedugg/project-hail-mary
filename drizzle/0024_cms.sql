CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`rolle` text,
	`password_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_contacts_client_email` ON `client_contacts` (`client_id`,`email`);--> statement-breakpoint
CREATE TABLE `content_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_id` text NOT NULL,
	`art` text NOT NULL,
	`slot` text,
	`schwere` text DEFAULT 'mittel' NOT NULL,
	`nachricht` text NOT NULL,
	`status` text DEFAULT 'offen' NOT NULL,
	`created_at` integer NOT NULL,
	`erledigt_at` integer,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_id` text NOT NULL,
	`snapshot_id` text,
	`ergebnis` text NOT NULL,
	`accuracy_pct` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `listing_snapshots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `content_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_id` text NOT NULL,
	`slot` text NOT NULL,
	`anker_index` integer,
	`content_version_id` text,
	`piece_id` text,
	`autor_typ` text NOT NULL,
	`autor_name` text NOT NULL,
	`autor_user_id` text,
	`autor_contact_id` text,
	`share_id` text,
	`art` text DEFAULT 'kommentar' NOT NULL,
	`nachricht` text NOT NULL,
	`status` text DEFAULT 'offen' NOT NULL,
	`erledigt_von` text,
	`erledigt_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_version_id`) REFERENCES `content_versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`piece_id`) REFERENCES `content_pieces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`autor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`autor_contact_id`) REFERENCES `client_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`share_id`) REFERENCES `content_shares`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `content_pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_id` text NOT NULL,
	`marketplace` text DEFAULT 'de' NOT NULL,
	`slot` text NOT NULL,
	`wert` text,
	`werte` text,
	`quelle` text DEFAULT 'manuell' NOT NULL,
	`status` text DEFAULT 'entwurf' NOT NULL,
	`notiz` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_pieces_product_slot_mp` ON `content_pieces` (`product_id`,`slot`,`marketplace`);--> statement-breakpoint
CREATE TABLE `content_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_id` text,
	`weg` text NOT NULL,
	`payload` text,
	`slots` text NOT NULL,
	`status` text DEFAULT 'erzeugt' NOT NULL,
	`hinweise` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`token` text NOT NULL,
	`contact_id` text,
	`label` text NOT NULL,
	`product_ids` text,
	`darf_freigeben` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `client_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_shares_token` ON `content_shares` (`token`);--> statement-breakpoint
ALTER TABLE `brands` ADD `publish_nur_mit_kundenfreigabe` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `content_versions` ADD `approved_by` text;--> statement-breakpoint
ALTER TABLE `content_versions` ADD `sent_to_client_at` integer;--> statement-breakpoint
ALTER TABLE `content_versions` ADD `sent_share_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `sku` text;--> statement-breakpoint
ALTER TABLE `products` ADD `amazon_product_type` text;