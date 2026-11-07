CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` text,
	`color` text,
	`unit` text DEFAULT 'each' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` real NOT NULL,
	`note` text,
	`build_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `movements_material_idx` ON `inventory_movements` (`material_id`);
--> statement-breakpoint
CREATE INDEX `movements_build_idx` ON `inventory_movements` (`build_id`);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`match_type` text NOT NULL,
	`shopify_variant_id` text,
	`custom_title` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_variant_uidx` ON `recipes` (`shopify_variant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_custom_title_uidx` ON `recipes` (`custom_title`);
--> statement-breakpoint
CREATE TABLE `recipe_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`material_id` text NOT NULL,
	`quantity` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recipe_lines_recipe_idx` ON `recipe_lines` (`recipe_id`);
--> statement-breakpoint
CREATE TABLE `shopify_products` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`handle` text,
	`status` text,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopify_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`sku` text,
	`selected_options` text DEFAULT '[]' NOT NULL,
	`product_title` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `shopify_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `shopify_variants` (`product_id`);
--> statement-breakpoint
CREATE TABLE `shopify_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`fulfillment_status` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopify_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`title` text NOT NULL,
	`name` text NOT NULL,
	`variant_title` text,
	`sku` text,
	`variant_id` text,
	`quantity` integer NOT NULL,
	`unfulfilled_quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `shopify_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `line_items_order_idx` ON `shopify_line_items` (`order_id`);
--> statement-breakpoint
CREATE INDEX `line_items_variant_idx` ON `shopify_line_items` (`variant_id`);
--> statement-breakpoint
CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`line_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `builds_line_idx` ON `builds` (`line_item_id`);
--> statement-breakpoint
CREATE INDEX `builds_order_idx` ON `builds` (`order_id`);
