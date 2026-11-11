CREATE TABLE IF NOT EXISTS "audit_noticias" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"rol" varchar(20),
	"accion" varchar(20) NOT NULL,
	"entidad_id" integer NOT NULL,
	"datos_anteriores" text,
	"datos_nuevos" text,
	"cambios" text,
	"ip" varchar(45),
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"hash_anterior" varchar(64),
	"hash" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_personas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"rol" varchar(20),
	"accion" varchar(20) NOT NULL,
	"entidad_id" integer NOT NULL,
	"datos_anteriores" text,
	"datos_nuevos" text,
	"cambios" text,
	"ip" varchar(45),
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"hash_anterior" varchar(64),
	"hash" varchar(64) NOT NULL
);
