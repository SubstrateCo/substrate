CREATE TABLE `configuration_state` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`configuration` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_session_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`harness` text NOT NULL,
	`native_session_id` text NOT NULL
);
