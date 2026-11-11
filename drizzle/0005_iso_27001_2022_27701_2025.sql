-- ════════════════════════════════════════════════════════════════════════════
-- Migración 0005 · ISO/IEC 27001:2022 (A.8.11, A.8.12, A.8.16) y
--                   ISO/IEC 27701:2025 (minimización, consentimiento, derechos)
--
-- Aplica cuatro cosas:
--   1. Consentimiento registrable (fecha, hora, IP, versión del aviso).
--   2. Derechos del titular: marcas de supresión.
--   3. Auditoría encadenada e inmutable (A.8.16).
--   4. Nuevas acciones de auditoría para los derechos del titular.
--
-- ⚠ ORDEN DE APLICACIÓN: los `ADD COLUMN` de `audit_log` deben ir DESPUÉS del
-- backfill, porque no pueden ser NOT NULL mientras la tabla tenga filas. Por eso el
-- archivo no usa los `ALTER TABLE ... ADD COLUMN ... NOT NULL` que genera la
-- herramienta, sino la secuencia explícita de abajo.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Acciones de auditoría para los derechos del titular ───────────────────
-- `ALTER TYPE ... ADD VALUE` no puede ejecutarse dentro de una transacción en
-- PostgreSQL < 12; desde la 12 sí, pero no dentro de un bloque que ya haya usado la
-- tabla. Drizzle separa cada sentencia, así que aquí van sueltas.
ALTER TYPE "audit_accion_enum" ADD VALUE IF NOT EXISTS 'consultar_datos';--> statement-breakpoint
ALTER TYPE "audit_accion_enum" ADD VALUE IF NOT EXISTS 'exportar_datos';--> statement-breakpoint
ALTER TYPE "audit_accion_enum" ADD VALUE IF NOT EXISTS 'suprimir_datos';--> statement-breakpoint
ALTER TYPE "audit_accion_enum" ADD VALUE IF NOT EXISTS 'consentimiento';--> statement-breakpoint

-- ── 2. Consentimiento y supresión en `personas` ──────────────────────────────
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "consentimiento_otorgado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "consentimiento_otorgado_en" timestamp;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "consentimiento_version" varchar(20);--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "consentimiento_ip" varchar(45);--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "supresion_solicitada_en" timestamp;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "supresion_completada_en" timestamp;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "supresion_motivo" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_personas_consentimiento" ON "personas" USING btree ("consentimiento_otorgado");--> statement-breakpoint

-- ⚠ REGISTROS PREEXISTENTES: no tienen constancia de consentimiento porque el aviso
-- y el campo no existían cuando se recogieron. NO se rellenan con una fecha
-- inventada: hacerlo fabricaría una prueba legal falsa. Se quedan en `false` y
-- quedan marcados para que la Carrera pueda regularizarlos (o volver a pedir el
-- consentimiento al titular en su próxima visita al portal).
COMMENT ON COLUMN "personas"."consentimiento_otorgado" IS
 'Consentimiento al aviso de privacidad. Los registros anteriores a esta migración están en false porque no existía constancia; regularizar antes de usarlos como evidencia.';--> statement-breakpoint

-- ── 3. Cadena de integridad en `audit_log` ───────────────────────────────────
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "hash_anterior" varchar(64);--> statement-breakpoint

-- Nullable primero, para poder backfillar filas que ya existen.
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "hash" varchar(64);--> statement-breakpoint

-- Backfill: se calcula la cadena EXISTENTE con la misma fórmula que
-- `lib/auditoria.ts`.
--
-- Por qué un bucle y no un UPDATE con subconsultas: la cadena es secuencial —el hash
-- de la fila N depende del hash de la fila N-1—, y los sub-selects de un UPDATE leen
-- el estado de la tabla ANTES de la sentencia, no los valores que se están escribiendo.
-- Con subconsultas, `hash_anterior` quedaría todo NULL y la verificación marcaría la
-- primera fila como alterada. El bucle avanza fila a fila y escribe en orden.
--
-- Se excluye `creado_en` del hash a propósito: la columna es `timestamp without time
-- zone` y el driver la interpreta en la zona del servidor, así que incluirla haría que
-- la verificación fallara al cambiar de zona horaria. El contenido queda protegido,
-- que es lo que importa.
DO $$
DECLARE
  r RECORD;
  v_anterior TEXT := NULL;
  v_hash TEXT;
BEGIN
  FOR r IN
    SELECT id, id_usuario, accion, entidad, entidad_id, detalles,
           datos_anteriores, datos_nuevos, ip
    FROM "audit_log"
    ORDER BY id ASC
  LOOP
    v_hash := encode(
      sha256(
        (
          coalesce(v_anterior, '')
          || coalesce(r.id_usuario::text, '')
          || r.accion::text
          || coalesce(r.entidad, '')
          || coalesce(r.entidad_id::text, '')
          || coalesce(r.detalles, '')
          || coalesce(r.datos_anteriores, '')
          || coalesce(r.datos_nuevos, '')
          || coalesce(r.ip, '')
        )::bytea
      ),
      'hex'
    );

    UPDATE "audit_log"
    SET "hash_anterior" = v_anterior, "hash" = v_hash
    WHERE id = r.id;

    v_anterior := v_hash;
  END LOOP;
END $$;--> statement-breakpoint

-- Ahora sí, NOT NULL.
ALTER TABLE "audit_log" ALTER COLUMN "hash" SET NOT NULL;--> statement-breakpoint

-- ── 4. Inmutabilidad del log (A.8.16) ────────────────────────────────────────
-- La cadena de hashes permite DETECTAR una manipulación, pero no la impide: quien
-- pueda escribir en la tabla puede reescribir la fila y recalcular los hashes hacia
-- adelante. Por eso el log se vuelve de solo-INSERT mediante un trigger que el motor
-- impone, y no el código de aplicación.
--
-- Se usa `FOR EACH ROW` con una función que aborta. `TRUNCATE` queda fuera del
-- alcance de un trigger de fila, así que se añade un trigger de truncado aparte: sin
-- él, un `TRUNCATE audit_log` borraría el histórico entero sin dejar rastro.
CREATE OR REPLACE FUNCTION audit_log_solo_insert() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log es de solo-INSERT (ISO/IEC 27001:2022 A.8.16): no se permite % ni %',
    TG_OP, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_bloquear_update ON "audit_log";--> statement-breakpoint
CREATE TRIGGER audit_log_bloquear_update
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_solo_insert();--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_log_bloquear_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log no admite TRUNCATE (ISO/IEC 27001:2022 A.8.16): el registro de actividad es inmutable'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_bloquear_truncate ON "audit_log";--> statement-breakpoint
CREATE TRIGGER audit_log_bloquear_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_bloquear_truncate();--> statement-breakpoint

-- ── 5. Coherencia del consentimiento ─────────────────────────────────────────
-- Impide que exista la marca de consentimiento sin fecha ni versión, o una fecha sin
-- marca. Sin este CHECK, un `UPDATE` podría dejar `consentimiento_otorgado = true` con
-- la fecha vacía, y el campo volvería a ser la casilla sin marcar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personas_consentimiento_coherente'
  ) THEN
    ALTER TABLE "personas" ADD CONSTRAINT "personas_consentimiento_coherente" CHECK (
      ("consentimiento_otorgado" AND "consentimiento_otorgado_en" IS NOT NULL AND "consentimiento_version" IS NOT NULL)
      OR (NOT "consentimiento_otorgado" AND "consentimiento_otorgado_en" IS NULL)
    );
  END IF;
END $$;--> statement-breakpoint