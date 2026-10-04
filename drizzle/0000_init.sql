CREATE TABLE `court_preferences` (
	`court` text PRIMARY KEY NOT NULL,
	`tier` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`date` text NOT NULL,
	`time_from` text NOT NULL,
	`time_to` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`calendar_event_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`player1` text NOT NULL,
	`player2` text NOT NULL,
	`score1` integer NOT NULL,
	`score2` integer NOT NULL,
	`created_at` integer NOT NULL
);
