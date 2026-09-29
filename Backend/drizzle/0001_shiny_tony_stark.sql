ALTER TABLE "eve_healthcare"."tests" ADD CONSTRAINT "tests_id_centre_id_unique" UNIQUE("id","centre_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eve_healthcare"."bookings" ADD CONSTRAINT "bookings_test_belongs_to_centre_fk" FOREIGN KEY ("test_id","centre_id") REFERENCES "eve_healthcare"."tests"("id","centre_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
