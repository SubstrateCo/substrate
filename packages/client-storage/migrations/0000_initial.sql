CREATE TABLE `agent_mcp_servers` (
	`organization_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`transport` text NOT NULL,
	`command` text,
	`args` text DEFAULT '[]' NOT NULL,
	`environment` text DEFAULT '{}' NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `agent_id`, `id`),
	CONSTRAINT "agent_mcp_servers_transport" CHECK(("agent_mcp_servers"."transport" = 'stdio' AND "agent_mcp_servers"."command" IS NOT NULL AND "agent_mcp_servers"."url" IS NULL) OR ("agent_mcp_servers"."transport" = 'http' AND "agent_mcp_servers"."url" IS NOT NULL AND "agent_mcp_servers"."command" IS NULL))
);
--> statement-breakpoint
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
CREATE TABLE `mail_connections` (
	`organization_id` text NOT NULL,
	`id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`address` text NOT NULL,
	`nickname` text,
	`protected_grant` text NOT NULL,
	`can_modify` integer DEFAULT false NOT NULL,
	`cursor` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`show_label_filters` integer DEFAULT true NOT NULL,
	`last_sync` integer,
	`unread_total` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	PRIMARY KEY(`organization_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_connections_organization_id_provider_provider_account_id_unique` ON `mail_connections` (`organization_id`,`provider`,`provider_account_id`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`organization_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`timestamp` integer NOT NULL,
	`subject` text NOT NULL,
	`from_address` text NOT NULL,
	`to_addresses` text NOT NULL,
	`snippet` text NOT NULL,
	`body` text NOT NULL,
	`flags` integer NOT NULL,
	`label_ids` text NOT NULL,
	`scan` text,
	FOREIGN KEY (`organization_id`,`mailbox_id`) REFERENCES `mail_connections`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_recent` ON `mail_messages` (`organization_id`,`timestamp`,`id`);--> statement-breakpoint
CREATE INDEX `mail_folder_counts` ON `mail_messages` (`organization_id`,`mailbox_id`,`flags`,`timestamp`);--> statement-breakpoint
CREATE INDEX `mail_thread` ON `mail_messages` (`organization_id`,`mailbox_id`,`thread_id`,`timestamp`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_messages_organization_id_mailbox_id_remote_id_unique` ON `mail_messages` (`organization_id`,`mailbox_id`,`remote_id`);--> statement-breakpoint
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