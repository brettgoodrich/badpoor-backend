CREATE TABLE `finished_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`shopify_variant_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` real NOT NULL,
	`note` text,
	`build_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finished_variant_idx` ON `finished_movements` (`shopify_variant_id`);
--> statement-breakpoint
CREATE INDEX `finished_build_idx` ON `finished_movements` (`build_id`);
