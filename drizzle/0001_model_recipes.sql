PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `recipes__new` (
	`id` text PRIMARY KEY NOT NULL,
	`match_type` text NOT NULL,
	`shopify_product_id` text,
	`custom_title` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `recipes__new` (`id`, `match_type`, `custom_title`, `notes`, `created_at`, `updated_at`)
SELECT `id`, `match_type`, `custom_title`, `notes`, `created_at`, `updated_at` FROM `recipes`;
--> statement-breakpoint
DROP TABLE `recipes`;
--> statement-breakpoint
ALTER TABLE `recipes__new` RENAME TO `recipes`;
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_product_uidx` ON `recipes` (`shopify_product_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_custom_title_uidx` ON `recipes` (`custom_title`);
--> statement-breakpoint
CREATE TABLE `recipe_lines__new` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`material_id` text NOT NULL,
	`role` text NOT NULL,
	`quantity` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `recipe_lines__new` (`id`, `recipe_id`, `material_id`, `role`, `quantity`)
SELECT `id`, `recipe_id`, `material_id`, `role`, `quantity` FROM `recipe_lines`;
--> statement-breakpoint
DROP TABLE `recipe_lines`;
--> statement-breakpoint
ALTER TABLE `recipe_lines__new` RENAME TO `recipe_lines`;
--> statement-breakpoint
CREATE INDEX `recipe_lines_recipe_idx` ON `recipe_lines` (`recipe_id`);
--> statement-breakpoint
CREATE TABLE `recipe_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_line_id` text NOT NULL,
	`variant_id` text NOT NULL,
	FOREIGN KEY (`recipe_line_id`) REFERENCES `recipe_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `material_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_exclusions_uidx` ON `recipe_exclusions` (`recipe_line_id`,`variant_id`);
--> statement-breakpoint
CREATE INDEX `recipe_exclusions_line_idx` ON `recipe_exclusions` (`recipe_line_id`);
--> statement-breakpoint
CREATE TABLE `recipe_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`shopify_variant_id` text NOT NULL,
	`blank_variant_id` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blank_variant_id`) REFERENCES `material_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_overrides_uidx` ON `recipe_overrides` (`recipe_id`,`shopify_variant_id`);
--> statement-breakpoint
CREATE INDEX `recipe_overrides_recipe_idx` ON `recipe_overrides` (`recipe_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
