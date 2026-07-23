CREATE TABLE `competitor_info_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`payload` text NOT NULL,
	`data_basis` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `competitor_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`asin` text NOT NULL,
	`source` text NOT NULL,
	`title` text,
	`bullets` text,
	`description` text,
	`attributes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
