import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, usuarios } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { aFiltroEnum } from "@/lib/filtros";

export const dynamic = "force-dynamic";

/**
 * GET /api/auditoria → registro de actividad (spec del PDF 4.2: "quién hizo qué cambios y cuándo").
 *
 * La tabla `audit_log` estaba definida en el esquema pero NO existía en la base y no había
 * ni una línea de código que escribiera en ella. Ahora cada alta, edición, baja,
 * exportación e importación queda registrada.
 *
 * Filtros: ?accion=&entidad=&usuarioId=&desde=&hasta=&page=&perPage=
 */

const ACCIONES = ["crear", "editar", "eliminar", "exportar", "importar", "consultar_datos", "exportar_datos", "suprimir_datos", "consentimiento"];

export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const sp = new URL(req.url).searchParams;

    const accion = sp.get("accion");
    if (accion && !ACCIONES.includes(accion)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }

    const where = [];
    // La acción se normaliza contra el ENUM de la columna: un valor inventado se
    // descarta en lugar de llegar a PostgreSQL y devolver un 500.
    const accionValida = aFiltroEnum(auditLog.accion, accion);
    if (accionValida) where.push(eq(auditLog.accion, accionValida));

    const entidad = sp.get("entidad");
    if (entidad && entidad !== "TODAS") where.push(eq(auditLog.entidad, entidad));

    const usuarioId = sp.get("usuarioId");
    if (usuarioId && usuarioId !== "TODOS")
      where.push(eq(auditLog.idUsuario, parseInt(usuarioId, 10)));

    const desde = sp.get("desde");
    if (desde && !Number.isNaN(Date.parse(desde))) {
      where.push(sql`${auditLog.creadoEn} >= ${new Date(desde)}`);
    }

    const hasta = sp.get("hasta");
    if (hasta && !Number.isNaN(Date.parse(hasta))) {
      // Incluir todo el día final.
      const fin = new Date(hasta);
      fin.setHours(23, 59, 59, 999);
      where.push(sql`${auditLog.creadoEn} <= ${fin}`);
    }

    const cond = where.length ? sql.join(where, sql` and `) : undefined;

    const pagina = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const perPage = Math.min(200, Math.max(10, parseInt(sp.get("perPage") ?? "50", 10) || 50));

    const [{ total }] = (await db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(cond)) as [{ total: number }];

    const filas = await db
      .select({
        id: auditLog.id,
        accion: auditLog.accion,
        entidad: auditLog.entidad,
        entidadId: auditLog.entidadId,
        detalles: auditLog.detalles,
        datosAnteriores: auditLog.datosAnteriores,
        datosNuevos: auditLog.datosNuevos,
        ip: auditLog.ip,
        creadoEn: auditLog.creadoEn,
        usuarioNombre: usuarios.nombre,
        usuarioCorreo: usuarios.correo,
      })
      .from(auditLog)
      .leftJoin(usuarios, eq(auditLog.idUsuario, usuarios.id))
      .where(cond)
      .orderBy(desc(auditLog.creadoEn))
      .limit(perPage)
      .offset((pagina - 1) * perPage);

    // Entidades distintas presentes, para poblar el filtro.
    const entidades = await db
      .selectDistinct({ e: auditLog.entidad })
      .from(auditLog)
      .orderBy(auditLog.entidad);

    return NextResponse.json({
      filas,
      total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / perPage)),
      entidades: entidades.map((x) => x.e),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    return errorInterno(e, "api/auditoria");
  }
}