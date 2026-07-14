CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`product_id` text,
	`scope` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`source` text DEFAULT 'listing-analyse' NOT NULL,
	`uplift_eur` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`done_at` integer,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
