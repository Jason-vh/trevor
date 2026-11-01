CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`time_from` text NOT NULL,
	`time_to` text NOT NULL,
	`court` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	`sent_sequence` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
