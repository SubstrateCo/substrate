CREATE INDEX "messaging_connection_organization_idx" ON "messaging_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "messaging_invitation_sender_idx" ON "messaging_invitations" USING btree ("sender_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_invitation_target_idx" ON "messaging_invitations" USING btree ("target_organization_id","status");--> statement-breakpoint
CREATE INDEX "messaging_invitation_recipient_idx" ON "messaging_invitations" USING btree ("recipient_user_id","status");