ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "correo_obligatorio" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "cambios_correo_restantes" integer DEFAULT 5 NOT NULL;