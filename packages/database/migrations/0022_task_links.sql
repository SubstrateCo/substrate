CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"source_task_entity_id" uuid NOT NULL,
	"target_task_entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by_actor_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_pair_unique" UNIQUE("organization_id","source_task_entity_id","target_task_entity_id","kind"),
	CONSTRAINT "task_links_kind_check" CHECK ("task_links"."kind" IN ('blocks', 'relates_to', 'duplicates')),
	CONSTRAINT "task_links_self_check" CHECK ("task_links"."source_task_entity_id" <> "task_links"."target_task_entity_id"),
	CONSTRAINT "task_links_relates_order_check" CHECK ("task_links"."kind" <> 'relates_to' OR "task_links"."source_task_entity_id" < "task_links"."target_task_entity_id")
);
--> statement-breakpoint
CREATE TABLE "task_comment_references" (
	"comment_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	CONSTRAINT "task_comment_references_comment_id_entity_id_pk" PRIMARY KEY("comment_id","entity_id"),
	CONSTRAINT "task_comment_references_type_check" CHECK ("task_comment_references"."entity_type" IN ('task', 'project'))
);
--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_source_fk" FOREIGN KEY ("organization_id","source_task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_target_fk" FOREIGN KEY ("organization_id","target_task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_creator_fk" FOREIGN KEY ("organization_id","created_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_references" ADD CONSTRAINT "task_comment_references_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment_references" ADD CONSTRAINT "task_comment_references_entity_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_links_target_idx" ON "task_links" USING btree ("organization_id","target_task_entity_id");--> statement-breakpoint
CREATE INDEX "task_comment_references_target_idx" ON "task_comment_references" USING btree ("organization_id","entity_id");