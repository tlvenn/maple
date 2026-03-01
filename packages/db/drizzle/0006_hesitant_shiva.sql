CREATE TABLE `detected_anomalies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`details_json` text NOT NULL,
	`github_issue_number` integer,
	`github_issue_url` text,
	`github_repo` text,
	`status` text DEFAULT 'open' NOT NULL,
	`detected_at` integer NOT NULL,
	`cooldown_until` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `anomalies_org_fp_cooldown_idx` ON `detected_anomalies` (`org_id`,`fingerprint`,`cooldown_until`);--> statement-breakpoint
CREATE INDEX `anomalies_org_status_idx` ON `detected_anomalies` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `github_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`github_account_login` text NOT NULL,
	`github_account_type` text NOT NULL,
	`selected_repos` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `github_int_org_idx` ON `github_integrations` (`org_id`);--> statement-breakpoint
CREATE INDEX `github_int_installation_idx` ON `github_integrations` (`installation_id`);