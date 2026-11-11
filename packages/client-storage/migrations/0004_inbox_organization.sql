CREATE UNIQUE INDEX `sessions_organization_id` ON `sessions` (`organization_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`body` text,
	`wake_id` text,
	`lane` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`available_at` integer NOT NULL,
	`deadline_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`held` integer DEFAULT false NOT NULL,
	`steered` integer DEFAULT false NOT NULL,
	`reason` text,
	`turn_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`,`session_id`) REFERENCES `sessions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Each item takes its session's organization. An item without a session cannot run, so it is not kept.
INSERT INTO `__new_inbox`("id", "organization_id", "session_id", "user_agent_id", "source", "source_ref", "body", "wake_id", "lane", "dedupe_key", "available_at", "deadline_at", "status", "held", "steered", "reason", "turn_id", "created_at") SELECT i."id", s."organization_id", i."session_id", i."user_agent_id", i."source", i."source_ref", i."body", i."wake_id", i."lane", i."dedupe_key", i."available_at", i."deadline_at", i."status", i."held", i."steered", i."reason", i."turn_id", i."created_at" FROM `inbox` i INNER JOIN `sessions` s ON s."id" = i."session_id";--> statement-breakpoint
DROP TABLE `inbox`;--> statement-breakpoint
ALTER TABLE `__new_inbox` RENAME TO `inbox`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_agent_dedupe` ON `inbox` (`user_agent_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `inbox_session_status` ON `inbox` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `inbox_organization_status` ON `inbox` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `inbox_turn` ON `inbox` (`turn_id`);