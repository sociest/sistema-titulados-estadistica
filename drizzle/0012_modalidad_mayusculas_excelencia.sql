DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'modalidad_titulacion_enum'
      AND e.enumlabel = 'TESIS'
  ) THEN
    CREATE TYPE "public"."modalidad_titulacion_enum_v2" AS ENUM(
      'TESIS',
      'PROYECTO DE GRADO',
      'EXAMEN DE GRADO',
      'TRABAJO DIRIGIDO',
      'EXCELENCIA',
      'OTRO'
    );

    ALTER TABLE "personas"
      ALTER COLUMN "modalidad_titulacion" TYPE "public"."modalidad_titulacion_enum_v2"
      USING (
        CASE UPPER(COALESCE("modalidad_titulacion"::text, ''))
          WHEN 'TESIS' THEN 'TESIS'::"public"."modalidad_titulacion_enum_v2"
          WHEN 'PROYECTO DE GRADO' THEN 'PROYECTO DE GRADO'::"public"."modalidad_titulacion_enum_v2"
          WHEN 'EXAMEN DE GRADO' THEN 'EXAMEN DE GRADO'::"public"."modalidad_titulacion_enum_v2"
          WHEN 'TRABAJO DIRIGIDO' THEN 'TRABAJO DIRIGIDO'::"public"."modalidad_titulacion_enum_v2"
          WHEN 'EXCELENCIA' THEN 'EXCELENCIA'::"public"."modalidad_titulacion_enum_v2"
          WHEN 'OTRO' THEN 'OTRO'::"public"."modalidad_titulacion_enum_v2"
          ELSE NULL
        END
      );

    DROP TYPE "public"."modalidad_titulacion_enum";
    ALTER TYPE "public"."modalidad_titulacion_enum_v2" RENAME TO "modalidad_titulacion_enum";
  END IF;
END $$;
