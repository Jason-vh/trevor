CREATE TABLE `recurring_bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`weekday` text NOT NULL,
	`time_from` text NOT NULL,
	`time_to` text NOT NULL,
	`created_at` integer NOT NULL,
	`stopped_at` integer
);
--> statement-breakpoint
ALTER TABLE `queue` ADD `recurring_booking_id` integer;