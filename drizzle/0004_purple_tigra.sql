CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"player1" text NOT NULL,
	"player2" text NOT NULL,
	"score1" integer NOT NULL,
	"score2" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
