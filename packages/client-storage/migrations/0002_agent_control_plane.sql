DROP TABLE `handoffs`;--> statement-breakpoint
DROP TABLE `helpers`;--> statement-breakpoint
DROP TABLE `inbox`;--> statement-breakpoint
DROP TABLE `outputs`;--> statement-breakpoint
DROP TABLE `routines`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `turn_events`;--> statement-breakpoint
DROP TABLE `turns`;--> statement-breakpoint
CREATE TABLE `handoffs` (
	`organization_id` text NOT NULL,
	`session_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`objectives` text NOT NULL,
	`open_work` text NOT NULL,
	`references` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `session_id`, `epoch`)
);
--> statement-breakpoint
CREATE TABLE `native_sessions` (
	`organization_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`harness` text NOT NULL,
	`native_session_id` text,
	`epoch` integer DEFAULT 0 NOT NULL,
	`epoch_turns` integer DEFAULT 0 NOT NULL,
	`prefix` text,
	`policy_version` integer,
	`rotation` text,
	`reset_generation` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `session_id`)
);
--> statement-breakpoint
CREATE TABLE `turn_events` (
	`organization_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`seq` integer NOT NULL,
	`attempt` integer NOT NULL,
	`kind` text NOT NULL,
	`item_id` text,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `turn_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `turn_runs` (
	`organization_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`session_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`envelope` text NOT NULL,
	`prefix_hash` text NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `turn_id`, `attempt`)
);
--> statement-breakpoint
CREATE INDEX `turn_runs_session` ON `turn_runs` (`organization_id`,`session_id`,`created_at`);