CREATE TABLE `metrics_daily` (
	`day` date NOT NULL,
	`members` int NOT NULL,
	`newsletter_subscribed` int NOT NULL,
	`newsletter_unsubscribed` int NOT NULL,
	`telegram_channels` int NOT NULL,
	`blaettchen_issues` int NOT NULL,
	CONSTRAINT `metrics_daily_day` PRIMARY KEY(`day`)
);
