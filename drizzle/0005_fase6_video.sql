CREATE TABLE `video_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`format` text DEFAULT '9:16' NOT NULL,
	`fit` text DEFAULT 'crop' NOT NULL,
	`timeline_json` text DEFAULT '{}' NOT NULL,
	`last_export_media_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`last_export_media_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `thumb_file_name` text;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `probe_json` text DEFAULT '{}' NOT NULL;