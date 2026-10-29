import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Better Auth tables (managed by the admin plugin schema)            */
/* These mirror what `@better-auth/cli generate` produces for pg.     */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // admin plugin fields
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // admin plugin field
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* App tables                                                          */
/* ------------------------------------------------------------------ */

/**
 * A participant in the secret santa. One per real person.
 * Linked to a Better Auth user once they sign up; `phone` is their contact
 * number. An optional pre-added participant can be reused on signup.
 */
export const participant = pgTable("participant", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  city: text("city").notNull().default(""),
  site: text("site").notNull().default(""),
  shift: text("shift").notNull().default(""),
  track: text("track").$type<"local" | "country">(),
  pickupPoint: text("pickup_point").notNull().default(""),
  wishes: text("wishes").notNull().default(""),
  consentAt: timestamp("consent_at"),
  reserveVolunteer: boolean("reserve_volunteer").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("participant_user_unique").on(table.userId)]);

/** Historical values are retained for existing rows; new draws use reveal. */
export type DeliveryMode = "reveal" | "wa_link" | "wa_direct";
export type DrawStatus = "draft" | "completed";

/**
 * A single secret-santa event/round. Holds budget + how results are
 * delivered. Multiple draws over time form the history used to avoid
 * repeating last year's pairing.
 */
export const draw = pgTable("draw", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  budget: integer("budget"),
  // Old prototype draws stay in history and never freeze new participation.
  garlandVersion: integer("garland_version").notNull().default(0),
  // Legacy single delivery mode. Superseded by the per-channel booleans
  // below; kept for back-compat / existing rows.
  deliveryMode: text("delivery_mode")
    .$type<DeliveryMode>()
    .notNull()
    .default("reveal"),
  // The private reveal page/token is always generated; `deliverReveal`
  // controls whether its link is returned to the organiser by the API.
  deliverReveal: boolean("deliver_reveal").notNull().default(true),
  // Legacy channel flags retained for saved data. No delivery code reads
  // them, including for previously scheduled draws; new draws set false.
  deliverWhatsapp: boolean("deliver_whatsapp").notNull().default(false),
  deliverEmail: boolean("deliver_email").notNull().default(false),
  deliverPush: boolean("deliver_push").notNull().default(false),
  // for the reveal page: max times a token may be viewed before it locks
  previewLimit: integer("preview_limit").notNull().default(3),
  // Legacy flag retained for saved draws. All new draws set false and the
  // algorithm forbids self-assignment regardless of this stored value.
  allowSelfDraw: boolean("allow_self_draw").notNull().default(false),
  // How many previous draws to avoid repeating pairings from (soft
  // constraint). 0 = disabled (default), 1 = last draw, 2 = last two, etc.
  historyDepth: integer("history_depth").notNull().default(0),
  ringPolicy: text("ring_policy").$type<"single" | "tracks">().notNull().default("single"),
  status: text("status").$type<DrawStatus>().notNull().default("draft"),
  // If set and still a draft, the scheduler runs the draw at/after this
  // time. No notifications are sent automatically. Null = run now.
  scheduledAt: timestamp("scheduled_at"),
  // Set when the draw was actually executed (pairs assigned).
  executedAt: timestamp("executed_at"),
  // When the giver->receiver pairs become public (admin history + every
  // participant's dashboard). Null = never reveal the full list.
  pairsVisibleAt: timestamp("pairs_visible_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One giver -> receiver pairing within a draw. `revealToken` is the
 * secret used by the public reveal page; `revealCount` enforces the
 * per-draw preview limit.
 */
export const assignment = pgTable("assignment", {
  id: serial("id").primaryKey(),
  drawId: integer("draw_id")
    .notNull()
    .references(() => draw.id, { onDelete: "cascade" }),
  giverId: integer("giver_id")
    .notNull()
    .references(() => participant.id, { onDelete: "cascade" }),
  receiverId: integer("receiver_id")
    .notNull()
    .references(() => participant.id, { onDelete: "cascade" }),
  revealToken: text("reveal_token").notNull().unique(),
  revealCount: integer("reveal_count").notNull().default(0),
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"),
  giftKind: text("gift_kind").$type<"physical" | "skill" | "certificate">().notNull().default("physical"),
  deliveryNote: text("delivery_note").notNull().default(""),
  reserveState: text("reserve_state").$type<"none" | "requested" | "assigned" | "resolved">().notNull().default("none"),
  reserveVolunteerId: integer("reserve_volunteer_id").references(() => participant.id, { onDelete: "set null" }),
  reserveSentAt: timestamp("reserve_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("assignment_draw_giver_unique").on(table.drawId, table.giverId),
  uniqueIndex("assignment_draw_receiver_unique").on(table.drawId, table.receiverId),
  check("assignment_not_self", sql`${table.giverId} <> ${table.receiverId}`),
]);

/**
 * A symmetric forbidden pair: giver `aId` will never draw `bId` and
 * vice-versa (e.g. couples, siblings).
 */
export const exclusion = pgTable("exclusion", {
  id: serial("id").primaryKey(),
  aId: integer("a_id")
    .notNull()
    .references(() => participant.id, { onDelete: "cascade" }),
  bId: integer("b_id")
    .notNull()
    .references(() => participant.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** A wishlist line owned by a participant, visible to their santa. */
export const wishlistItem = pgTable("wishlist_item", {
  id: serial("id").primaryKey(),
  participantId: integer("participant_id")
    .notNull()
    .references(() => participant.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  url: text("url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Legacy subscriptions, retained to avoid deleting existing user data.
 * The subscription API and all Web Push sending code have been removed.
 */
export const pushSubscription = pgTable("push_subscription", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Generic key/value app settings, edited at runtime from the admin panel.
 * Currently holds OpenGraph / site metadata (title, description,
 * banner). One row per key.
 */
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** A coordinator may see and manage only participants at these sites. */
export const coordinatorScope = pgTable("coordinator_scope", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  city: text("city").notNull(),
  site: text("site").notNull(),
}, (table) => [uniqueIndex("coordinator_scope_unique").on(table.userId, table.city, table.site)]);

export const giftAudit = pgTable("gift_audit", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignment.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** City-scoped site identities; historical names continue to resolve after edits. */
export const workSite = pgTable("work_site", {
  id: serial("id").primaryKey(),
  city: text("city").notNull(),
  cityKey: text("city_key").notNull(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
}, (table) => [uniqueIndex("work_site_identity_unique").on(table.cityKey, table.nameKey)]);

export const workSiteAlias = pgTable("work_site_alias", {
  id: serial("id").primaryKey(),
  cityKey: text("city_key").notNull(),
  nameKey: text("name_key").notNull(),
  siteId: integer("site_id").notNull().references(() => workSite.id, { onDelete: "cascade" }),
}, (table) => [uniqueIndex("work_site_alias_identity_unique").on(table.cityKey, table.nameKey)]);

export type User = typeof user.$inferSelect;
export type Participant = typeof participant.$inferSelect;
export type Draw = typeof draw.$inferSelect;
export type Assignment = typeof assignment.$inferSelect;
export type Exclusion = typeof exclusion.$inferSelect;
export type WishlistItem = typeof wishlistItem.$inferSelect;
export type AppSetting = typeof appSetting.$inferSelect;
export type PushSubscription = typeof pushSubscription.$inferSelect;
