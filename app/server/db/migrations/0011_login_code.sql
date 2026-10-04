ALTER TABLE `login_tokens` ADD `code_key` varchar(64);--> statement-breakpoint
ALTER TABLE `login_tokens` ADD `code_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `login_tokens` ADD `code_attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_login_tokens_code_key` ON `login_tokens` (`code_key`);