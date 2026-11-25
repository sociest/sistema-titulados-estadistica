-- Actualiza índices de la tabla personas según src/db/schema.ts:
-- reemplaza el índice único de cédula por índice btree no único y agrega índice
-- funcional por correo en minúsculas.
DROP INDEX IF EXISTS "personas_ci_unique_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_ci" ON "personas" USING btree ("cedula_identidad");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_correo_lower" ON "personas" USING btree (lower("correo_electronico"));
