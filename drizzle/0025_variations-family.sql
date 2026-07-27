ALTER TABLE `products` ADD `variant_role` text DEFAULT 'standalone' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `parent_product_id` text REFERENCES products(id);--> statement-breakpoint
ALTER TABLE `products` ADD `variation_theme` text;--> statement-breakpoint
ALTER TABLE `products` ADD `variant_axis_values` text;