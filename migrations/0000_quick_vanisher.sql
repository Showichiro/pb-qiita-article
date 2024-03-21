CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`created_at` text NOT NULL,
	`likes_count` integer NOT NULL,
	`stocks_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`article_id` text,
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE cascade
);
