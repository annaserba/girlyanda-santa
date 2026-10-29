CREATE UNIQUE INDEX "assignment_draw_giver_unique" ON "assignment" USING btree ("draw_id","giver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_draw_receiver_unique" ON "assignment" USING btree ("draw_id","receiver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_user_unique" ON "participant" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_not_self" CHECK ("assignment"."giver_id" <> "assignment"."receiver_id");