CREATE TABLE `analytics_syncs` (
	`account_id` text PRIMARY KEY NOT NULL,
	`last_sync_at` text NOT NULL,
	`last_error` text,
	`unavailable_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `metrics_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`scope` text NOT NULL,
	`external_media_id` text DEFAULT '' NOT NULL,
	`metric` text NOT NULL,
	`day` text NOT NULL,
	`value` real NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metrics_unique` ON `metrics_snapshots` (`account_id`,`scope`,`external_media_id`,`metric`,`day`);--> statement-breakpoint
CREATE TABLE `remote_media` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`external_id` text NOT NULL,
	`media_type` text DEFAULT '' NOT NULL,
	`product_type` text DEFAULT '' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`permalink` text,
	`thumbnail_url` text,
	`published_at` text NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comments_count` integer DEFAULT 0 NOT NULL,
	`post_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_media_unique` ON `remote_media` (`account_id`,`external_id`);