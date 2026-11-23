CREATE TABLE `mail_connections` (
	`organization_id` text NOT NULL,
	`id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`address` text NOT NULL,
	`nickname` text,
	`protected_grant` text NOT NULL,
	`cursor` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`last_sync` integer,
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
CREATE UNIQUE INDEX `mail_messages_organization_id_mailbox_id_remote_id_unique` ON `mail_messages` (`organization_id`,`mailbox_id`,`remote_id`);