CREATE TYPE "eve_healthcare"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
ALTER TABLE "eve_healthcare"."users" ADD COLUMN "role" "eve_healthcare"."user_role" DEFAULT 'USER' NOT NULL;