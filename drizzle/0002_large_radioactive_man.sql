ALTER TABLE "personas" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "eliminado_en" timestamp;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "eliminado_por" integer;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "motivo_baja" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personas" ADD CONSTRAINT "personas_eliminado_por_usuarios_id_fk" FOREIGN KEY ("eliminado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_activo" ON "personas" USING btree ("activo");