CREATE TABLE "messaging_agent_participants" (
	"conversation_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	CONSTRAINT "messaging_agent_participants_conversation_id_actor_entity_id_pk" PRIMARY KEY("conversation_id","actor_entity_id")
);
--> statement-breakpoint
CREATE TABLE "agent_tool_requests" (
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "agent_tool_requests_organization_id_actor_entity_id_tool_request_id_pk" PRIMARY KEY("organization_id","actor_entity_id","tool","request_id")
);
--> statement-breakpoint
ALTER TABLE "messaging_messages" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD COLUMN "author_actor_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD COLUMN "author_organization_id" text;--> statement-breakpoint
UPDATE "messaging_messages" m SET "author_actor_entity_id" = a.entity_id, "author_organization_id" = a.organization_id
FROM "messaging_participants" p JOIN "actors" a ON a.user_id = p.user_id AND a.organization_id = p.organization_id AND a.type = 'human'
WHERE p.conversation_id = m.conversation_id AND p.user_id = m.author_id;--> statement-breakpoint
ALTER TABLE "messaging_agent_participants" ADD CONSTRAINT "messaging_agent_participants_organization_id_conversation_id_messaging_conversations_organization_id_id_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."messaging_conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_agent_participants" ADD CONSTRAINT "messaging_agent_participants_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_requests" ADD CONSTRAINT "agent_tool_requests_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_author_organization_id_author_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("author_organization_id","author_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_actor_message_request_unique" UNIQUE("author_actor_entity_id","request_id");--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_author_check" CHECK (("messaging_messages"."author_id" IS NOT NULL OR "messaging_messages"."author_actor_entity_id" IS NOT NULL) AND (("messaging_messages"."author_actor_entity_id" IS NULL) = ("messaging_messages"."author_organization_id" IS NULL)));
