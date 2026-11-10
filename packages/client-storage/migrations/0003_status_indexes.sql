CREATE INDEX `outputs_target_kind` ON `outputs` (`target_kind`);--> statement-breakpoint
CREATE INDEX `sessions_organization_agent` ON `sessions` (`organization_id`,`user_agent_id`);--> statement-breakpoint
CREATE INDEX `sessions_origin_conversation` ON `sessions` (`origin_conversation_id`);--> statement-breakpoint
CREATE INDEX `sessions_destination_conversation` ON `sessions` (`destination_conversation_id`);