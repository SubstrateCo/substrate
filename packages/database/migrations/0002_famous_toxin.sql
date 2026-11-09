CREATE TABLE "agent_run_replies" (
	"run_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_replies_run_id_message_id_pk" PRIMARY KEY("run_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "agent_run_replies" ADD CONSTRAINT "agent_run_replies_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_replies" ADD CONSTRAINT "agent_run_replies_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_replies_message_unique" ON "agent_run_replies" USING btree ("message_id");