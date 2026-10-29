CREATE TABLE "coordinator_scope" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"city" text NOT NULL,
	"site" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "received_at" timestamp;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "gift_kind" text DEFAULT 'physical' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "delivery_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "reserve_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "reserve_volunteer_id" integer;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "reserve_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "draw" ADD COLUMN "ring_policy" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "site" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "shift" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "track" text;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "pickup_point" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "wishes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "reserve_volunteer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coordinator_scope" ADD CONSTRAINT "coordinator_scope_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_audit" ADD CONSTRAINT "gift_audit_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_audit" ADD CONSTRAINT "gift_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_reserve_volunteer_id_participant_id_fk" FOREIGN KEY ("reserve_volunteer_id") REFERENCES "public"."participant"("id") ON DELETE set null ON UPDATE no action;