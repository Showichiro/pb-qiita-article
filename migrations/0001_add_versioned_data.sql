CREATE TABLE `active_data_generation` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`published_sequence` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `data_generations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `data_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`owner_id` text,
	`based_on_generation_id` text,
	`created_at` text NOT NULL,
	`manifest_digest` text,
	`article_count` integer,
	`tag_count` integer,
	`published_sequence` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_generations_published_seq_idx` ON `data_generations` (`published_sequence`);--> statement-breakpoint
CREATE TABLE `generation_articles` (
	`generation_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`created_at` text NOT NULL,
	`likes_count` integer NOT NULL,
	`stocks_count` integer NOT NULL,
	PRIMARY KEY(`generation_id`, `id`),
	FOREIGN KEY (`generation_id`) REFERENCES `data_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_articles_version_created_idx` ON `generation_articles` (`generation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `generation_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`generation_id` text NOT NULL,
	`article_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `data_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`,`article_id`) REFERENCES `generation_articles`(`generation_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_tags_version_article_idx` ON `generation_tags` (`generation_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `generation_tags_version_name_idx` ON `generation_tags` (`generation_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `generation_tags_article_position_idx` ON `generation_tags` (`generation_id`,`article_id`,`position`);
--> statement-breakpoint
-- Stage legacy generation (do NOT publish yet - validate first)
INSERT OR IGNORE INTO `data_generations` (`id`, `state`, `created_at`, `manifest_digest`, `article_count`, `tag_count`)
VALUES ('legacy', 'staging', 'legacy', 'legacy', (SELECT COUNT(*) FROM `articles`), (SELECT COUNT(*) FROM `tags` WHERE `article_id` IS NOT NULL));
--> statement-breakpoint
-- Copy legacy articles to staging
INSERT OR IGNORE INTO `generation_articles` (`generation_id`, `id`, `title`, `user_id`, `user_name`, `created_at`, `likes_count`, `stocks_count`)
SELECT 'legacy', `id`, `title`, `user_id`, `user_name`, `created_at`, `likes_count`, `stocks_count`
FROM `articles`;
--> statement-breakpoint
-- Copy legacy tags to staging
INSERT OR IGNORE INTO `generation_tags` (`generation_id`, `article_id`, `name`, `position`)
SELECT 'legacy', `article_id`, `name`, `id`
FROM `tags`
WHERE `article_id` IS NOT NULL;
--> statement-breakpoint
-- Validate counts integrity before publishing
-- Only publish if legacy has actual data (non-empty)
-- If empty, leave as staging - will result in 503 no active until new import
UPDATE `data_generations`
SET `state` = 'published',
    `published_sequence` = 1,
    `article_count` = (SELECT COUNT(*) FROM `generation_articles` WHERE `generation_id` = 'legacy'),
    `tag_count` = (SELECT COUNT(*) FROM `generation_tags` WHERE `generation_id` = 'legacy')
WHERE `id` = 'legacy'
  AND `state` = 'staging'
  AND (SELECT COUNT(*) FROM `generation_articles` WHERE `generation_id` = 'legacy') > 0
  AND (SELECT COUNT(*) FROM `generation_articles` WHERE `generation_id` = 'legacy') = (SELECT `article_count` FROM `data_generations` WHERE `id` = 'legacy')
  AND (SELECT COUNT(*) FROM `generation_tags` WHERE `generation_id` = 'legacy') = (SELECT `tag_count` FROM `data_generations` WHERE `id` = 'legacy');
--> statement-breakpoint
-- Only set active pointer if legacy was successfully published
INSERT OR IGNORE INTO `active_data_generation` (`singleton`, `generation_id`, `published_sequence`)
SELECT 1, 'legacy', 1
WHERE EXISTS (SELECT 1 FROM `data_generations` WHERE `id` = 'legacy' AND `state` = 'published');