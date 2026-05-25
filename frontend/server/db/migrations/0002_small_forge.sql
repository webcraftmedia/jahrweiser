UPDATE `users` SET `newsletter_subscribed` = 'subscribed' WHERE `newsletter_subscribed` IS NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `newsletter_subscribed` enum('subscribed','unsubscribed') NOT NULL DEFAULT 'subscribed';
