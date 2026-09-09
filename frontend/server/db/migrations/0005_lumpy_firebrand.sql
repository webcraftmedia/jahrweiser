CREATE TABLE `telegram_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` varchar(500),
	`url` varchar(500) NOT NULL,
	`is_public` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_by_uid` varchar(255),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `telegram_channels` ADD CONSTRAINT `telegram_channels_created_by_uid_users_uid_fk` FOREIGN KEY (`created_by_uid`) REFERENCES `users`(`uid`) ON DELETE set null ON UPDATE no action;