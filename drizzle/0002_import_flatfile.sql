CREATE TABLE `flatfile_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`file_name` text NOT NULL,
	`sheet_name` text,
	`header_rows` text NOT NULL,
	`field_names` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `listing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`source` text NOT NULL,
	`title` text,
	`bullets` text,
	`description` text,
	`image_urls` text,
	`raw` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
