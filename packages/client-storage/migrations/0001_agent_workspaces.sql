CREATE TABLE `agent_workspaces` (
	`organization_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`path` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `agent_id`)
);
--> statement-breakpoint
ALTER TABLE `native_sessions` ADD `workspace` text;