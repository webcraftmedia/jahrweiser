CREATE TABLE `user_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`type` varchar(48) NOT NULL,
	`user_uid` varchar(255),
	`actor_uid` varchar(255),
	`meta` json,
	`ip_prefix` varchar(45),
	CONSTRAINT `user_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_events` ADD CONSTRAINT `user_events_user_uid_users_uid_fk` FOREIGN KEY (`user_uid`) REFERENCES `users`(`uid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_events` ADD CONSTRAINT `user_events_actor_uid_users_uid_fk` FOREIGN KEY (`actor_uid`) REFERENCES `users`(`uid`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_user_events_user_at` ON `user_events` (`user_uid`,`at`);--> statement-breakpoint
CREATE INDEX `idx_user_events_at` ON `user_events` (`at`);--> statement-breakpoint
CREATE INDEX `idx_user_events_type_at` ON `user_events` (`type`,`at`);