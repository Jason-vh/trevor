CREATE TABLE `booking_origins` (
	`date` text NOT NULL,
	`time` text NOT NULL,
	`court` text NOT NULL,
	`chat_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`date`, `time`, `court`)
);
