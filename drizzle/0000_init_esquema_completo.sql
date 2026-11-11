DO $$ BEGIN
 CREATE TYPE "public"."audit_accion_enum" AS ENUM('crear', 'editar', 'eliminar', 'exportar', 'importar');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."estado_laboral_enum" AS ENUM('EMPLEADO', 'DESEMPLEADO', 'INDEPENDIENTE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."genero_enum" AS ENUM('MASCULINO', 'FEMENINO', 'PREFIERO_NO_DECIR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inicio_proceso_enum" AS ENUM('SI', 'NO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."modalidad_titulacion_enum" AS ENUM('Tesis', 'Proyecto de grado', 'Examen de grado', 'Trabajo dirigido', 'Otro');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."motivo_no_titulacion_enum" AS ENUM('LABORAL', 'ECONOMICO', 'PERSONAL', 'EN_PROCESO', 'OTRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."noticias_tipo_enum" AS ENUM('noticia_institucional', 'curso_evento', 'noticia_social');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."planea_titularse_enum" AS ENUM('SI', 'NO', 'NO_SABE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sector_trabajo_enum" AS ENUM('PUBLICO', 'PRIVADO', 'ACADEMICO', 'ONG', 'OTRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tipo_estudiante" AS ENUM('TITULADO', 'EGRESADO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."usuario_estado_enum" AS ENUM('activo', 'inactivo', 'bloqueado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."usuario_rol_enum" AS ENUM('admin', 'usuario');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"accion" "audit_accion_enum" NOT NULL,
	"entidad" varchar(100) NOT NULL,
	"entidad_id" integer,
	"detalles" text,
	"datos_anteriores" text,
	"datos_nuevos" text,
	"ip" varchar(45),
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "noticias_cursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" varchar(250) NOT NULL,
	"cuerpo" text NOT NULL,
	"tipo" "noticias_tipo_enum" DEFAULT 'noticia_institucional' NOT NULL,
	"categoria" varchar(20) DEFAULT 'noticia' NOT NULL,
	"fecha" date NOT NULL,
	"imagen_url" varchar(500),
	"publicado" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personas" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_estudiante" DEFAULT 'TITULADO' NOT NULL,
	"nombres_apellidos" text NOT NULL,
	"cedula_identidad" varchar(20) NOT NULL,
	"genero" "genero_enum" DEFAULT 'PREFIERO_NO_DECIR' NOT NULL,
	"semestre_ingreso" varchar(20),
	"semestre_egreso" varchar(30),
	"anio_egreso" integer,
	"anio_titulacion" integer,
	"modalidad_titulacion" "modalidad_titulacion_enum",
	"area_especializacion" text,
	"planea_titularse" "planea_titularse_enum",
	"inicio_proceso_titulacion" "inicio_proceso_enum",
	"motivo_no_titulacion" "motivo_no_titulacion_enum",
	"correo_electronico" text,
	"telefono" varchar(20),
	"redes_sociales" text,
	"ciudad_region_trabajo" text,
	"estado_laboral" "estado_laboral_enum" DEFAULT 'DESEMPLEADO',
	"sector_trabajo" "sector_trabajo_enum",
	"sector_trabajo_otro" text,
	"ocupacion_cargo" text,
	"trabaja_en_estadistica" boolean DEFAULT false,
	"tiempo_egreso_titulacion_meses" integer,
	"tiempo_insercion_laboral_meses" integer,
	"observaciones" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now(),
	CONSTRAINT "personas_cedula_identidad_unique" UNIQUE("cedula_identidad")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"ci" varchar(20),
	"nombre" text NOT NULL,
	"correo" varchar(150) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"rol" "usuario_rol_enum" DEFAULT 'admin' NOT NULL,
	"estado" "usuario_estado_enum" DEFAULT 'activo' NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now(),
	CONSTRAINT "usuarios_correo_unique" UNIQUE("correo")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_id_usuario_usuarios_id_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_accion" ON "audit_log" USING btree ("accion");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_creado_en" ON "audit_log" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_noticias_tipo" ON "noticias_cursos" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_noticias_fecha" ON "noticias_cursos" USING btree ("fecha");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personas_ci_unique_idx" ON "personas" USING btree ("cedula_identidad");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_tipo" ON "personas" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_estado_laboral" ON "personas" USING btree ("estado_laboral");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_sector_trabajo" ON "personas" USING btree ("sector_trabajo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_anio_titulacion" ON "personas" USING btree ("anio_titulacion");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_anio_egreso" ON "personas" USING btree ("anio_egreso");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_ciudad" ON "personas" USING btree ("ciudad_region_trabajo");