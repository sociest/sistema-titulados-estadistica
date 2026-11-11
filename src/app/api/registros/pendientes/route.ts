import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas, verificaciones } from "@/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { aValorEnum } from "@/lib/filtros";

export const dynamic = "force-dynamic";

/**
 * Bandeja de solicitudes del alta pública (decisión D5, opción B). Solo admin.
 *
 *   GET /api/registros/pendientes          → listado de PENDIENTES (por defecto) o de
 *                                            RECHAZADOS con ?estado=RECHAZADO
 *   GET /api/registros/pendientes&resumen=1 → solo los contadores, para el panel
 *
 * Cada fila trae además `verificado`: si el egresado abrió el enlace del correo. La
 * diferencia es importante para decidir rápido: una solicitud sin verificar probablemente es
 * una cédula inventada y se rechaza; una verificada solo necesita que alguien revise los
 * datos que declaró.
 */
export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const sp = new URL(req.url).searchParams;
    const estado = (sp.get("estado") ?? "PENDIENTE").toUpperCase();
    if (!["PENDIENTE", "RECHAZADO", "VALIDADO"].includes(estado)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    if (sp.get("resumen") === "1") {
      const [conteo] = await db
        .select({ n: count() })
        .from(personas)
        .where(
          sql`${personas.estadoRegistro} in ('PENDIENTE','RECHAZADO') and ${personas.activo} = true`
        );
      const [verificados] = await db
        .select({ n: count() })
        .from(personas)
        .where(
          and(
            eq(personas.estadoRegistro, "PENDIENTE"),
            eq(personas.activo, true),
            sql`exists (select 1 from ${verificaciones} v where v.id_persona = ${personas.id} and v.usada_en is not null)`
          )
        );
      return NextResponse.json({
        pendientes: conteo?.n ?? 0,
        pendientesVerificados: verificados?.n ?? 0,
      });
    }

    // El estado ya se validó contra la lista cerrada de arriba; la conversión al tipo
    // del ENUM es segura y evita el `as any` que convertía un 400 en un 500 de la BD.
    const estadoEnum = aValorEnum(personas.estadoRegistro, estado) ?? "PENDIENTE";

    const conds = [eq(personas.estadoRegistro, estadoEnum), eq(personas.activo, true)];

    const filas = await db
      .select({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
        tipo: personas.tipo,
        genero: personas.genero,
        correoElectronico: personas.correoElectronico,
        telefono: personas.telefono,
        semestreIngreso: personas.semestreIngreso,
        semestreEgreso: personas.semestreEgreso,
        anioEgreso: personas.anioEgreso,
        anioTitulacion: personas.anioTitulacion,
        modalidadTitulacion: personas.modalidadTitulacion,
        areaEspecializacion: personas.areaEspecializacion,
        planeaTitularse: personas.planeaTitularse,
        motivoNoTitulacion: personas.motivoNoTitulacion,
        ciudadRegionTrabajo: personas.ciudadRegionTrabajo,
        estadoLaboral: personas.estadoLaboral,
        sectorTrabajo: personas.sectorTrabajo,
        ocupacionCargo: personas.ocupacionCargo,
        motivoRechazo: personas.motivoRechazo,
        creadoEn: personas.creadoEn,
        // ¿Abrió el enlace de verificación del correo?
        verificado: sql`exists (select 1 from ${verificaciones} v where v.id_persona = ${personas.id} and v.usada_en is not null)`,
        enlaceExpirado: sql`exists (select 1 from ${verificaciones} v where v.id_persona = ${personas.id} and v.usada_en is null and v.expira_en < now())`,
      })
      .from(personas)
      .where(and(...conds))
      .orderBy(desc(personas.creadoEn))
      .limit(500);

    return NextResponse.json({ filas, total: filas.length, estado });
  } catch (e) {
    return errorInterno(e, "api/registros/pendientes GET");
  }
}