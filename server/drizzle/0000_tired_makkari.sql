CREATE TYPE "public"."check_status" AS ENUM('confirmed', 'flagged', 'inconclusive', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."discovery_source" AS ENUM('triage', 'manual');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."module" AS ENUM('M1', 'M2', 'M3', 'M4', 'M5', 'M6');--> statement-breakpoint
CREATE TYPE "public"."publish_channel" AS ENUM('x', 'site_only');--> statement-breakpoint
CREATE TYPE "public"."publish_tier" AS ENUM('auto', 'auto_hedged', 'human');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."triage_stage" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "check_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"module" "module" NOT NULL,
	"status" "check_status" NOT NULL,
	"confidence" "confidence" NOT NULL,
	"claim" text NOT NULL,
	"evidence_url" text,
	"raw_snapshot_ref" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_required" CHECK ("check_result"."status" = 'not_applicable' OR ("check_result"."evidence_url" IS NOT NULL AND "check_result"."raw_snapshot_ref" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"check_id" uuid,
	"contact" text,
	"statement" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kol_wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"attributed_identity" text NOT NULL,
	"evidence_source" text NOT NULL,
	"confidence" "confidence" NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mint" text NOT NULL,
	"creator" text NOT NULL,
	"x_handle" text,
	"github_url" text,
	"website_url" text,
	"launch_ts" timestamp with time zone NOT NULL,
	"discovery_source" "discovery_source" NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_mint_unique" UNIQUE("mint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publish_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"tier" "publish_tier" NOT NULL,
	"channel" "publish_channel" NOT NULL,
	"x_post_id" text,
	"approver" text,
	"payload" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "report_project_version" UNIQUE("project_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"check_id" uuid,
	"module" "module" NOT NULL,
	"tier" "publish_tier" NOT NULL,
	"proposed_text" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"approver" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "triage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mint" text NOT NULL,
	"stage" "triage_stage" NOT NULL,
	"reason" text NOT NULL,
	"signals" jsonb,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "check_result" ADD CONSTRAINT "check_result_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute" ADD CONSTRAINT "dispute_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute" ADD CONSTRAINT "dispute_check_id_check_result_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."check_result"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publish_event" ADD CONSTRAINT "publish_event_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report" ADD CONSTRAINT "report_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_item" ADD CONSTRAINT "review_item_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_item" ADD CONSTRAINT "review_item_check_id_check_result_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."check_result"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_result_report_idx" ON "check_result" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_item_status_idx" ON "review_item" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "triage_log_mint_idx" ON "triage_log" USING btree ("mint");