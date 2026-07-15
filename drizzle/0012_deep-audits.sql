CREATE TABLE `deep_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`payload` text NOT NULL,
	`data_basis` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
