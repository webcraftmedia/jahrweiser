-- Hash in place rather than dropping the rows, so links already in somebody's
-- inbox survive the deploy. SHA2() yields the same lowercase hex as sha256().
UPDATE `login_tokens` SET `token` = SHA2(`token`, 256);--> statement-breakpoint
ALTER TABLE `login_tokens` RENAME COLUMN `token` TO `token_hash`;
