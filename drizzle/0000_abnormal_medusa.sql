CREATE TABLE `request_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`condition` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_code` text NOT NULL,
	`condition` text NOT NULL,
	`protocol_version` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`submitted_at` text,
	`stage` text NOT NULL,
	`session_json` text,
	`content_hash` text,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`responses_count` integer DEFAULT 0 NOT NULL,
	`runs_count` integer DEFAULT 0 NOT NULL,
	`pre_score` integer,
	`post_score` integer,
	`transfer_score` integer,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_participant_code_unique` ON `submissions` (`participant_code`);--> statement-breakpoint
CREATE INDEX `submissions_updated_idx` ON `submissions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `submissions_status_idx` ON `submissions` (`stage`);