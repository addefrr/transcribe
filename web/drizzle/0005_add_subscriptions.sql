CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"tier" text NOT NULL,
	"interval" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"allowance_minutes" integer NOT NULL,
	"minutes_used" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "billing" text DEFAULT 'credits' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id","status");