CREATE TABLE `profile_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`snapshot_id` text,
	`instruction` text DEFAULT '' NOT NULL,
	`result_json` text NOT NULL,
	`request_json` text DEFAULT '{}' NOT NULL,
	`applied_json` text DEFAULT '{}' NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`profile_id`) REFERENCES `tracked_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `profile_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`source` text NOT NULL,
	`captured_at` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`profile_id`) REFERENCES `tracked_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracked_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`is_own` integer DEFAULT true NOT NULL,
	`account_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
