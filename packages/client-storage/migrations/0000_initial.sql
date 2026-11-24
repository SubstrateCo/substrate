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
	`session_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`objectives` text NOT NULL,
	`open_work` text NOT NULL,
	`references` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `epoch`)
);
--> statement-breakpoint
CREATE TABLE `helpers` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_session_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`request_id` text NOT NULL,
	`task` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`report` text,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `helpers_request` ON `helpers` (`parent_session_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `helpers_agent_status` ON `helpers` (`user_agent_id`,`status`);--> statement-breakpoint
CREATE TABLE `inbox` (
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
CREATE UNIQUE INDEX `inbox_agent_dedupe` ON `inbox` (`user_agent_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `inbox_session_status` ON `inbox` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `inbox_organization_status` ON `inbox` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `inbox_turn` ON `inbox` (`turn_id`);--> statement-breakpoint
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
CREATE TABLE `outputs` (
	`turn_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`conversation_id` text,
	`thread_id` text,
	`request_kind` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`turn_id`, `target_kind`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `outputs_target_kind` ON `outputs` (`target_kind`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`cron` text NOT NULL,
	`timezone` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`approved_revision` integer,
	`destination_conversation_id` text NOT NULL,
	`destination_thread_id` text,
	`catch_up` text DEFAULT 'latest' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_fire_at` integer,
	`last_fired_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `routines_due` ON `routines` (`enabled`,`next_fire_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`parent_session_id` text,
	`origin_conversation_id` text,
	`origin_thread_id` text,
	`destination_conversation_id` text,
	`destination_thread_id` text,
	`harness` text NOT NULL,
	`native_session_id` text,
	`epoch` integer DEFAULT 0 NOT NULL,
	`epoch_turns` integer DEFAULT 0 NOT NULL,
	`prefix` text,
	`policy_version` integer,
	`rotation` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_agent_key` ON `sessions` (`user_agent_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_organization_id` ON `sessions` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `sessions_organization_agent` ON `sessions` (`organization_id`,`user_agent_id`);--> statement-breakpoint
CREATE INDEX `sessions_origin_conversation` ON `sessions` (`origin_conversation_id`);--> statement-breakpoint
CREATE INDEX `sessions_destination_conversation` ON `sessions` (`destination_conversation_id`);--> statement-breakpoint
CREATE TABLE `turn_events` (
	`turn_id` text NOT NULL,
	`seq` integer NOT NULL,
	`attempt` integer NOT NULL,
	`kind` text NOT NULL,
	`item_id` text,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`turn_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_agent_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`folder_key` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`outcome` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`epoch` integer NOT NULL,
	`handoff` integer DEFAULT false NOT NULL,
	`envelope` text,
	`prefix_hash` text,
	`usage` text,
	`event_count` integer DEFAULT 0 NOT NULL,
	`activity` text,
	`error` text,
	`attention_reason` text,
	`interruption` text,
	`recoveries` integer DEFAULT 0 NOT NULL,
	`auto_continue` integer DEFAULT true NOT NULL,
	`resumes_turn_id` text,
	`source_messages` text DEFAULT '[]' NOT NULL,
	`request_anchors` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `turns_session` ON `turns` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `turns_agent_page` ON `turns` (`organization_id`,`user_agent_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `turns_status` ON `turns` (`status`);