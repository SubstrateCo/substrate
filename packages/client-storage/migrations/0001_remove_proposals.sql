-- Agents no longer propose. Approval results that no turn or event refers to go away.
DELETE FROM `inbox`
WHERE `source` = 'approval_result'
	AND `turn_id` IS NULL
	AND NOT EXISTS (SELECT 1 FROM `turn_events` WHERE `turn_events`.`item_id` = `inbox`.`id`);--> statement-breakpoint
-- A turn's history keeps its items. Drop them so that no turn delivers or steers them again.
UPDATE `inbox`
SET `status` = 'dropped', `reason` = 'trigger_removed'
WHERE `source` = 'approval_result' AND `status` <> 'dropped';--> statement-breakpoint
-- The proposal requests no longer exist on the server.
DELETE FROM `outputs` WHERE `request_kind` = 'proposal';--> statement-breakpoint
UPDATE `turns` SET `outcome` = 'replied' WHERE `outcome` = 'proposed';
