CREATE TABLE "realtime_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"changes" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() + interval '10 seconds' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
