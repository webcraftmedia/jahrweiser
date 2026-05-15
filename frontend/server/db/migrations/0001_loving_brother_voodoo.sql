ALTER TABLE `users` ADD `newsletter_subscribed` enum('subscribed','unsubscribed');--> statement-breakpoint
ALTER TABLE `users` ADD `unsubscribe_token` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `newsletter_last_sent_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_unsubscribe_token_unique` UNIQUE(`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `idx_users_newsletter_subscribed` ON `users` (`newsletter_subscribed`);