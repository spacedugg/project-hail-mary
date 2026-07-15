CREATE TABLE `review_scrapes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`source` text DEFAULT 'apify' NOT NULL,
	`asins` text NOT NULL,
	`reviews` text NOT NULL,
	`star_counts` text NOT NULL,
	`per_asin` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
