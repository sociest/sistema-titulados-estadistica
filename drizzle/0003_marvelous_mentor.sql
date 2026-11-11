DO $$ BEGIN
 CREATE TYPE "public"."estado_registro_enum" AS ENUM('PENDIENTE', 'VALIDADO', 'RECHAZADO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verificaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_persona" integer NOT NULL,
	"proposito" varchar(40) DEFAULT 'REGISTRO' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"destino" varchar(150) NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"expira_en" timestamp NOT NULL,
	"usada_en" timestamp,
	"creada_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verificaciones_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "estado_registro" "estado_registro_enum" DEFAULT 'VALIDADO' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "fecha_validacion" timestamp;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "motivo_rechazo" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_id_persona_personas_id_fk" FOREIGN KEY ("id_persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verificaciones_id_persona" ON "verificaciones" USING btree ("id_persona");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verificaciones_expira_en" ON "verificaciones" USING btree ("expira_en");