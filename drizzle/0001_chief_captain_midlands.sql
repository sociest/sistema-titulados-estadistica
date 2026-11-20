CREATE TABLE IF NOT EXISTS "sesiones" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"id_persona" integer,
	"token_hash" varchar(64) NOT NULL,
	"ci" varchar(20) NOT NULL,
	"rol" varchar(30) NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"creada_en" timestamp DEFAULT now() NOT NULL,
	"ultima_actividad_en" timestamp DEFAULT now() NOT NULL,
	"expira_en" timestamp NOT NULL,
	"revocada_en" timestamp,
	"motivo_revocacion" varchar(120),
	CONSTRAINT "sesiones_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_id_usuario_usuarios_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_id_persona_personas_id_fk" FOREIGN KEY ("id_persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sesiones_id_usuario" ON "sesiones" USING btree ("id_usuario");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sesiones_ci" ON "sesiones" USING btree ("ci");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sesiones_expira_en" ON "sesiones" USING btree ("expira_en");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sesiones_revocada_en" ON "sesiones" USING btree ("revocada_en");