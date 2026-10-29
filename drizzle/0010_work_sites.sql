CREATE TABLE "work_site" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"city_key" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_site_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_key" text NOT NULL,
	"name_key" text NOT NULL,
	"site_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_site_alias" ADD CONSTRAINT "work_site_alias_site_id_work_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."work_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_site_identity_unique" ON "work_site" USING btree ("city_key","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "work_site_alias_identity_unique" ON "work_site_alias" USING btree ("city_key","name_key");
--> statement-breakpoint
WITH existing AS (
  SELECT id, city, site, 0 AS priority FROM participant
  UNION ALL
  SELECT id, city, site, 1 AS priority FROM coordinator_scope
), cleaned AS (
  SELECT id, priority,
    btrim(regexp_replace(normalize(city, NFKC), '\s+', ' ', 'g')) AS city,
    btrim(regexp_replace(normalize(site, NFKC), '\s+', ' ', 'g')) AS name
  FROM existing
), keyed AS (
  SELECT *, replace(lower(city), 'ё', 'е') AS city_key,
    replace(lower(name), 'ё', 'е') AS name_key
  FROM cleaned WHERE city <> '' AND name <> ''
)
INSERT INTO work_site (city, city_key, name, name_key)
SELECT DISTINCT ON (city_key, name_key) city, city_key, name, name_key
FROM keyed ORDER BY city_key, name_key, priority, id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO work_site_alias (city_key, name_key, site_id)
SELECT city_key, name_key, id FROM work_site
ON CONFLICT DO NOTHING;
