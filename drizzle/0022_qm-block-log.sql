CREATE TABLE `qm_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`bereich` text NOT NULL,
	`findings` text NOT NULL,
	`versuche` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
