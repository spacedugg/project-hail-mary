CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`voice_tone` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo_url` text,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_slug_unique` ON `clients` (`slug`);--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`validation` text,
	`generated_by` text,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`synced_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`keyword` text NOT NULL,
	`search_volume` integer,
	`tier` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_group_id` text,
	`asin` text,
	`marketplace` text DEFAULT 'de' NOT NULL,
	`name` text NOT NULL,
	`facts` text DEFAULT '{}' NOT NULL,
	`price_cents` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_group_id`) REFERENCES `product_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_brand_asin_mp` ON `products` (`brand_id`,`asin`,`marketplace`);--> statement-breakpoint
CREATE TABLE `report_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`marketplace` text DEFAULT 'de' NOT NULL,
	`report_type` text NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`file_name` text NOT NULL,
	`parsed` text,
	`parse_status` text DEFAULT 'pending' NOT NULL,
	`parse_error` text,
	`is_suspended` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`data_basis` text NOT NULL,
	`confidence` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
