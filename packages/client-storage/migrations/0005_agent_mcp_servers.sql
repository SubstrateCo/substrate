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
