ALTER TYPE "usuario_rol_enum" ADD VALUE 'KARDEX';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "carreras" (
	"id" serial PRIMARY KEY NOT NULL,
	"ci" varchar(20) NOT NULL,
	"carrera" varchar(200),
	"universidad" varchar(200),
	"facultad" varchar(200),
	"grados" varchar(200),
	"creada_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solicitudtitulado" (
	"id" serial PRIMARY KEY NOT NULL,
	"ci" varchar(20) NOT NULL,
	"fechasolicitud" timestamp DEFAULT now() NOT NULL,
	"fecharevision" timestamp,
	"ipmaquinaaprobo" varchar(45),
	"nombre" varchar(150),
	"detalle" text,
	"estado" varchar(30) DEFAULT 'PENDIENTE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solicitudtitulado_documentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"nombre_almacenado" varchar(100) NOT NULL,
	"tipo_mime" varchar(100) NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudtitulado_documentos_nombre_almacenado_unique" UNIQUE("nombre_almacenado")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solicitudtitulado_historial" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"ci" varchar(20) NOT NULL,
	"estado" varchar(30) NOT NULL,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"nombre" varchar(150),
	"ip" varchar(45),
	"detalle" text
);
--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "nivelestudio" varchar(50);--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "realizo_curso_ultimos_3_anios" boolean;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "ultimocurso" varchar(200);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "carreras" ADD CONSTRAINT "carreras_ci_personas_cedula_identidad_fk" FOREIGN KEY ("ci") REFERENCES "public"."personas"("cedula_identidad") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudtitulado" ADD CONSTRAINT "solicitudtitulado_ci_personas_cedula_identidad_fk" FOREIGN KEY ("ci") REFERENCES "public"."personas"("cedula_identidad") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudtitulado_documentos" ADD CONSTRAINT "solicitudtitulado_documentos_solicitud_id_solicitudtitulado_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudtitulado"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudtitulado_historial" ADD CONSTRAINT "solicitudtitulado_historial_solicitud_id_solicitudtitulado_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudtitulado"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudtitulado_historial" ADD CONSTRAINT "solicitudtitulado_historial_ci_personas_cedula_identidad_fk" FOREIGN KEY ("ci") REFERENCES "public"."personas"("cedula_identidad") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_carreras_ci" ON "carreras" USING btree ("ci");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "solicitudtitulado_una_pendiente_por_ci" ON "solicitudtitulado" USING btree ("ci") WHERE "solicitudtitulado"."estado" = 'PENDIENTE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_solicitudtitulado_ci_fecha" ON "solicitudtitulado" USING btree ("ci","fechasolicitud");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_solicitudtitulado_estado_fecha" ON "solicitudtitulado" USING btree ("estado","fechasolicitud");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_solicitudtitulado_documentos_solicitud" ON "solicitudtitulado_documentos" USING btree ("solicitud_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_solicitudtitulado_historial_solicitud" ON "solicitudtitulado_historial" USING btree ("solicitud_id","fecha");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION normalizar_textos_formularios() RETURNS trigger AS $$
BEGIN
	IF TG_TABLE_NAME = 'personas' THEN
		NEW.nombres_apellidos := upper(btrim(NEW.nombres_apellidos));
		NEW.area_especializacion := nullif(upper(btrim(NEW.area_especializacion)), '');
		NEW.ciudad_region_trabajo := nullif(upper(btrim(NEW.ciudad_region_trabajo)), '');
		NEW.sector_trabajo_otro := nullif(upper(btrim(NEW.sector_trabajo_otro)), '');
		NEW.ocupacion_cargo := nullif(upper(btrim(NEW.ocupacion_cargo)), '');
		NEW.observaciones := nullif(upper(btrim(NEW.observaciones)), '');
		NEW.nivelestudio := nullif(upper(btrim(NEW.nivelestudio)), '');
		NEW.ultimocurso := nullif(upper(btrim(NEW.ultimocurso)), '');
		NEW.correo_electronico := nullif(lower(btrim(NEW.correo_electronico)), '');
		NEW.redes_sociales := nullif(btrim(NEW.redes_sociales), '');
	ELSIF TG_TABLE_NAME = 'usuarios' THEN
		NEW.nombre := upper(btrim(NEW.nombre));
		NEW.correo := lower(btrim(NEW.correo));
	ELSIF TG_TABLE_NAME = 'carreras' THEN
		NEW.carrera := nullif(upper(btrim(NEW.carrera)), '');
		NEW.universidad := nullif(upper(btrim(NEW.universidad)), '');
		NEW.facultad := nullif(upper(btrim(NEW.facultad)), '');
		NEW.grados := nullif(upper(btrim(NEW.grados)), '');
	ELSIF TG_TABLE_NAME IN ('solicitudtitulado', 'solicitudtitulado_historial') THEN
		NEW.nombre := nullif(upper(btrim(NEW.nombre)), '');
		NEW.detalle := nullif(upper(btrim(NEW.detalle)), '');
	ELSIF TG_TABLE_NAME = 'noticias_cursos' THEN
		NEW.titulo := upper(btrim(NEW.titulo));
		NEW.cuerpo := upper(btrim(NEW.cuerpo));
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER normalizar_textos_personas BEFORE INSERT OR UPDATE ON "personas" FOR EACH ROW EXECUTE FUNCTION normalizar_textos_formularios();
--> statement-breakpoint
CREATE TRIGGER normalizar_textos_usuarios BEFORE INSERT OR UPDATE ON "usuarios" FOR EACH ROW EXECUTE FUNCTION normalizar_textos_formularios();
--> statement-breakpoint
CREATE TRIGGER normalizar_textos_carreras BEFORE INSERT OR UPDATE ON "carreras" FOR EACH ROW EXECUTE FUNCTION normalizar_textos_formularios();
--> statement-breakpoint
CREATE TRIGGER normalizar_textos_solicitudtitulado BEFORE INSERT OR UPDATE ON "solicitudtitulado" FOR EACH ROW EXECUTE FUNCTION normalizar_textos_formularios();
--> statement-breakpoint
CREATE TRIGGER normalizar_textos_solicitudtitulado_historial BEFORE INSERT OR UPDATE ON "solicitudtitulado_historial" FOR EACH ROW EXECUTE FUNCTION normalizar_textos_formularios();
--> statement-breakpoint
CREATE TRIGGER normalizar_textos_noticias BEFORE INSERT OR UPDATE ON "noticias_cursos" FOR EACH ROW EXECUTE FUNCTION normalizar_textos_formularios();
--> statement-breakpoint
UPDATE "sesiones" s SET "ci" = regexp_replace(p."cedula_identidad", '[^0-9]', '', 'g'), "revocada_en" = now() FROM "personas" p WHERE s."ci" = p."cedula_identidad" AND p."cedula_identidad" !~ '^[0-9]+$';
--> statement-breakpoint
UPDATE "usuarios" u SET "ci" = regexp_replace(p."cedula_identidad", '[^0-9]', '', 'g') FROM "personas" p WHERE u."ci" = p."cedula_identidad" AND p."cedula_identidad" !~ '^[0-9]+$';
--> statement-breakpoint
UPDATE "personas" SET "cedula_identidad" = regexp_replace("cedula_identidad", '[^0-9]', '', 'g') WHERE "cedula_identidad" !~ '^[0-9]+$';
--> statement-breakpoint
UPDATE "personas" SET "nombres_apellidos" = "nombres_apellidos";
--> statement-breakpoint
UPDATE "usuarios" SET "nombre" = "nombre", "correo" = "correo";
--> statement-breakpoint
UPDATE "noticias_cursos" SET "titulo" = "titulo", "cuerpo" = "cuerpo";
--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_ci_solo_digitos" CHECK ("cedula_identidad" ~ '^[0-9]+$');
--> statement-breakpoint
ALTER TABLE "solicitudtitulado" ADD CONSTRAINT "solicitudtitulado_estado_valido" CHECK ("estado" IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO'));
--> statement-breakpoint
ALTER TABLE "solicitudtitulado" ADD CONSTRAINT "solicitudtitulado_rechazo_con_detalle" CHECK ("estado" <> 'RECHAZADO' OR coalesce(length(btrim("detalle")) > 0, false));
--> statement-breakpoint
ALTER TABLE "solicitudtitulado" ADD CONSTRAINT "solicitudtitulado_revision_estado" CHECK (("estado" = 'PENDIENTE' AND "fecharevision" IS NULL) OR ("estado" IN ('ACEPTADO', 'RECHAZADO') AND "fecharevision" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "solicitudtitulado_historial" ADD CONSTRAINT "solicitudtitulado_historial_estado_valido" CHECK ("estado" IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO'));
--> statement-breakpoint
ALTER TABLE "solicitudtitulado_documentos" ADD CONSTRAINT "solicitudtitulado_documento_tipo_valido" CHECK ("tipo_mime" IN ('application/pdf', 'image/png', 'image/jpeg'));
--> statement-breakpoint
ALTER TABLE "solicitudtitulado_documentos" ADD CONSTRAINT "solicitudtitulado_documento_tamano_valido" CHECK ("tamano_bytes" > 0 AND "tamano_bytes" <= 10485760);