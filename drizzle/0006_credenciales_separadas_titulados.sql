CREATE TABLE IF NOT EXISTS "credenciales_persona" (
	"id_persona" integer PRIMARY KEY NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credenciales_persona" ADD CONSTRAINT "credenciales_persona_id_persona_personas_id_fk" FOREIGN KEY ("id_persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
