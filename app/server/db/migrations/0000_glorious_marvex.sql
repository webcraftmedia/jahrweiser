CREATE TABLE `users` (
	`uid` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`display_name` varchar(255),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`login_disabled` boolean NOT NULL DEFAULT false,
	`deleted_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_uid` PRIMARY KEY(`uid`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `user_tags` (
	`user_uid` varchar(255) NOT NULL,
	`tag` varchar(64) NOT NULL,
	CONSTRAINT `user_tags_user_uid_tag_pk` PRIMARY KEY(`user_uid`,`tag`)
);
--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`token` varchar(64) NOT NULL,
	`user_uid` varchar(255) NOT NULL,
	`requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime NOT NULL,
	`consumed_at` datetime,
	CONSTRAINT `login_tokens_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(64) NOT NULL,
	`user_uid` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`last_seen_at` datetime,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`collection_url` varchar(500) NOT NULL,
	`sync_token` varchar(255),
	`last_synced_at` datetime,
	`running_since` datetime,
	CONSTRAINT `sync_state_collection_url` PRIMARY KEY(`collection_url`)
);
--> statement-breakpoint
ALTER TABLE `user_tags` ADD CONSTRAINT `user_tags_user_uid_users_uid_fk` FOREIGN KEY (`user_uid`) REFERENCES `users`(`uid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_tokens` ADD CONSTRAINT `login_tokens_user_uid_users_uid_fk` FOREIGN KEY (`user_uid`) REFERENCES `users`(`uid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_uid_users_uid_fk` FOREIGN KEY (`user_uid`) REFERENCES `users`(`uid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_users_deleted_at` ON `users` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_user_tags_tag` ON `user_tags` (`tag`);--> statement-breakpoint
CREATE INDEX `idx_login_tokens_user` ON `login_tokens` (`user_uid`);--> statement-breakpoint
CREATE INDEX `idx_login_tokens_expires` ON `login_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_uid`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);