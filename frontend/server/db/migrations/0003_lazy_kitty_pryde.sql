CREATE TABLE `registration_links` (
	`token` varchar(64) NOT NULL,
	`created_by_uid` varchar(255) NOT NULL,
	`label` varchar(255),
	`max_uses` int,
	`expires_at` datetime,
	`revoked_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `registration_links_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
CREATE TABLE `registration_link_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`link_token` varchar(64) NOT NULL,
	`user_uid` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `registration_link_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `registration_links` ADD CONSTRAINT `registration_links_created_by_uid_users_uid_fk` FOREIGN KEY (`created_by_uid`) REFERENCES `users`(`uid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registration_link_redemptions` ADD CONSTRAINT `rlr_link_fk` FOREIGN KEY (`link_token`) REFERENCES `registration_links`(`token`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registration_link_redemptions` ADD CONSTRAINT `rlr_user_fk` FOREIGN KEY (`user_uid`) REFERENCES `users`(`uid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_registration_links_created_by` ON `registration_links` (`created_by_uid`);--> statement-breakpoint
CREATE INDEX `idx_rlr_link` ON `registration_link_redemptions` (`link_token`);--> statement-breakpoint
CREATE INDEX `idx_rlr_user` ON `registration_link_redemptions` (`user_uid`);