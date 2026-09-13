CREATE TABLE "court_preferences" (
	"court" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "court_preferences" ("court", "tier") VALUES
	('Baan 12', 'preferred'),
	('Baan 13', 'preferred'),
	('Baan 1', 'avoided')
ON CONFLICT ("court") DO NOTHING;
