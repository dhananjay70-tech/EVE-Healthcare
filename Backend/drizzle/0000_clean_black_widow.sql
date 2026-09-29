CREATE SCHEMA "eve_healthcare";
--> statement-breakpoint
CREATE TYPE "eve_healthcare"."booking_status" AS ENUM('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "eve_healthcare"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eve_healthcare"."bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"appointment_at" timestamp with time zone NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" "eve_healthcare"."booking_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_amount_positive" CHECK ("eve_healthcare"."bookings"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eve_healthcare"."centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eve_healthcare"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" "eve_healthcare"."payment_status" DEFAULT 'PENDING' NOT NULL,
	"provider_event_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("eve_healthcare"."payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eve_healthcare"."tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tests_price_positive" CHECK ("eve_healthcare"."tests"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eve_healthcare"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eve_healthcare"."bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "eve_healthcare"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eve_healthcare"."bookings" ADD CONSTRAINT "bookings_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "eve_healthcare"."tests"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eve_healthcare"."bookings" ADD CONSTRAINT "bookings_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "eve_healthcare"."centres"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eve_healthcare"."payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "eve_healthcare"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eve_healthcare"."tests" ADD CONSTRAINT "tests_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "eve_healthcare"."centres"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_user_id_idx" ON "eve_healthcare"."bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_test_id_idx" ON "eve_healthcare"."bookings" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_centre_id_idx" ON "eve_healthcare"."bookings" USING btree ("centre_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_booking_id_idx" ON "eve_healthcare"."payments" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_event_id_unique" ON "eve_healthcare"."payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_one_success_per_booking_idx" ON "eve_healthcare"."payments" USING btree ("booking_id") WHERE "eve_healthcare"."payments"."status" = 'SUCCESS';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_centre_id_idx" ON "eve_healthcare"."tests" USING btree ("centre_id");