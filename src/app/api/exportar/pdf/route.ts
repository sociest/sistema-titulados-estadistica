import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aFiltroEnum } from "@/lib/filtros";
import { personas } from "@/db/schema";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { exigirAdmin, errorInterno, leerSesionVigente } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { verificarDescarga } from "@/lib/descargas";
import { generarReportePdf } from "@/lib/reportePdf";

export const dynamic = "force-dynamic";
// pdfkit y xlsx son pesados; el runtime debe ser Node, no Edge.
export const runtime = "nodejs";

/**
 * GET /api/exportar/pdf  (SOLO ADMIN)
 *
 * Exporta el dashboard completo a PDF, generado EN MEMORIA (nunca en disco), como exige
 * `important.md` §2. Es la evidencia que pide la especificación (apartado 3.3):
 * "Exportar el dashboard completo a PDF para incluir como evidencia en el informe de
 * acreditación".
 *
 * Antes solo existía `window.print()`, que abre el diálogo del navegador y no produce
 * un archivo.
 *
 * Parámetros:
 *   vista=TITULADOS|EGRESADOS|COMPARATIVO
 *   sector, modalidad, anioMin, anioMax  → mismos filtros que el dashboard
 *   conDetalle=1                       → agrega la tabla de registros
 *
 * NOTA SOBRE PRIVACIDAD: este PDF es una descarga autenticada de la base completa y su
 * destinatario es la Carrera, que es la finalidad declarada del sistema. A diferencia de
 * `/api/dashboard`, que solo devuelve agregados, este documento incluye datos
 * personales porque quien lo descarga tiene rol admin y necesita la base para acreditar.
 * Lo que sí lleva es firma de descarga temporal (A.8.12) y registro en auditoría.
 */

export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const sp = new URL(req.url).searchParams;

    // Firma de descarga: liga este archivo a esta sesión y a los próximos minutos.
    const sesion = await leerSesionVigente(req);
    if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });

    const firma = verificarDescarga(
      "/api/exportar/pdf",
      sp.get("sig"),
      sp.get("exp") ? Number(sp.get("exp")) : null,
      sp.get("sub"),
      String(sesion.sub)
    );
    if (!firma.valida) {
      await registrarAuditoria({
        accion: "exportar",
        entidad: "dashboard",
        idUsuario: sesion.sub,
        detalles: `PDF rechazado por firma inválida (motivo: ${firma.motivo})`,
        req,
      });
      return NextResponse.json(
        {
          error:
            firma.motivo === "expirada"
              ? "El enlace de descarga expiró. Genere uno nuevo."
              : "Enlace de descarga no válido.",
          motivo: firma.motivo,
        },
        { status: 403 }
      );
    }
    const vista = (sp.get("vista") ?? "TITULADOS").toUpperCase();
    const conDetalle = sp.get("conDetalle") === "1";

    if (!["TITULADOS", "EGRESADOS", "COMPARATIVO"].includes(vista)) {
      return NextResponse.json({ error: "Vista inválida" }, { status: 400 });
    }

    const conds: SQL[] = [];
    // Baja lógica (decisión D3): los reportes de acreditación no cuentan las bajas.
    if (sp.get("incluirBajas") !== "true") {
      conds.push(eq(personas.activo, true), eq(personas.estadoRegistro, "VALIDADO"));
    }
    const anioMinRaw = sp.get("anioMin");
    const anioMaxRaw = sp.get("anioMax");
    const anioMin = anioMinRaw ? parseInt(anioMinRaw, 10) : null;
    const anioMax = anioMaxRaw ? parseInt(anioMaxRaw, 10) : null;
    const sector = sp.get("sector");
    const sectorValido = aFiltroEnum(personas.sectorTrabajo, sector);
    if (sectorValido) conds.push(eq(personas.sectorTrabajo, sectorValido));
    const modalidad = sp.get("modalidad");
    const modalidadValida = aFiltroEnum(personas.modalidadTitulacion, modalidad, "TODAS");
    if (modalidadValida) conds.push(eq(personas.modalidadTitulacion, modalidadValida));
    if (anioMin !== null && Number.isFinite(anioMin))
      conds.push(sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) >= ${anioMin}`);
    if (anioMax !== null && Number.isFinite(anioMax))
      conds.push(sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) <= ${anioMax}`);

    const where = conds.length ? and(...conds) : undefined;

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const kpis = await db
      .select({
        tipo: personas.tipo,
        total: sql<number>`count(*)::int`,
        empleados: sql<number>`count(*) filter (where ${personas.estadoLaboral} in ('EMPLEADO','INDEPENDIENTE'))::int`,
        enEstadistica: sql<number>`count(*) filter (where ${personas.estadoLaboral} in ('EMPLEADO','INDEPENDIENTE') and ${personas.trabajaEnEstadistica} is true)::int`,
        promEgrTit: sql<number>`coalesce(round(avg(${personas.tiempoEgresoTitulacionMeses})::numeric,2),0)::float`,
        promInsercion: sql<number>`coalesce(round(avg(${personas.tiempoInsercionLaboralMeses})::numeric,2),0)::float`,
      })
      .from(personas)
      .where(where)
      .groupBy(personas.tipo);

    const t = kpis.find((k) => k.tipo === "TITULADO");
    const e = kpis.find((k) => k.tipo === "EGRESADO");
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);

    // ── Series ───────────────────────────────────────────────────────────────
    const aniosRaw = await db
      .select({
        anio: sql<number>`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso})::int`,
        tipo: personas.tipo,
        n: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(and(where, sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) is not null`))
      .groupBy(sql`1`, personas.tipo)
      .orderBy(sql`1`);

    const mapa = new Map<number, { titulados: number; egresados: number }>();
    for (const f of aniosRaw) {
      if (!f.anio) continue;
      const v = mapa.get(f.anio) ?? { titulados: 0, egresados: 0 };
      if (f.tipo === "TITULADO") v.titulados += f.n;
      else v.egresados += f.n;
      mapa.set(f.anio, v);
    }
    const porAnio = Array.from(mapa.entries())
      .map(([anio, v]) => ({ anio, titulados: v.titulados, egresados: v.egresados }))
      .sort((a, b) => a.anio - b.anio);

    const ETIQUETA_SECTOR: Record<string, string> = {
      PUBLICO: "Público", PRIVADO: "Privado", ACADEMICO: "Académico / Investigación",
      ONG: "ONG / Fundaciones", OTRO: "Otro", NO_ESPECIFICADO: "Sin Especificar",
    };

    // Expresión del sector legible. Se reutiliza tal cual en SELECT y en GROUP BY: usar
    // la referencia posicional `sql`1`` es frágil, porque cualquier cambio en la expresión
    // (como un cast) la desalinea y PostgreSQL exige que la columna esté en el GROUP BY.
    const exprSector = sql<string>`coalesce(case when ${personas.sectorTrabajo} = 'OTRO' then nullif(trim(${personas.sectorTrabajoOtro}),'') else ${personas.sectorTrabajo}::text end, 'Sin Especificar')`;

    const sectores = await db
      .select({
        tipo: personas.tipo,
        key: exprSector,
        n: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(where)
      .groupBy(personas.tipo, exprSector)
      .orderBy(sql`3 desc`);

    const exprCiudad = sql<string>`coalesce(nullif(trim(${personas.ciudadRegionTrabajo}),''),'No especificado')`;

    const geos = await db
      .select({
        tipo: personas.tipo,
        ciudad: exprCiudad,
        n: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(where)
      .groupBy(personas.tipo, exprCiudad)
      .orderBy(sql`3 desc`);

    const aSectores = (tipo: string) =>
      sectores.filter((s) => s.tipo === tipo).map((s) => ({ name: ETIQUETA_SECTOR[s.key] ?? s.key, valor: s.n }));

    const aGeo = (tipo: string) => geos.filter((g) => g.tipo === tipo).map((g) => ({ ciudad: g.ciudad, total: g.n }));

    const cohortes = await db
      .select({
        cohorte: sql<string>`coalesce(nullif(trim(${personas.semestreIngreso}),''),'No registrado')`,
        titulados: sql<number>`count(*) filter (where ${personas.tipo}='TITULADO')::int`,
        egresados: sql<number>`count(*) filter (where ${personas.tipo}='EGRESADO')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const modalidades = await db
      .select({
        modalidad: sql<string>`coalesce(${personas.modalidadTitulacion}::text,'Sin especificar')`,
        n: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(and(where, eq(personas.tipo, "TITULADO")))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);

    const motivos = await db
      .select({
        motivo: sql<string>`coalesce(${personas.motivoNoTitulacion}::text,'Sin especificar')`,
        n: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(and(where, eq(personas.tipo, "EGRESADO"), sql`${personas.motivoNoTitulacion} is not null`))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);

    // ── Detalle (opcional) ───────────────────────────────────────────────────
    let detalle: Array<Record<string, unknown>> = [];
    if (conDetalle) {
      const condDetalle =
        vista === "TITULADOS"
          ? and(where, eq(personas.tipo, "TITULADO"))
          : vista === "EGRESADOS"
            ? and(where, eq(personas.tipo, "EGRESADO"))
            : where;

      const filas = await db
        .select({
          cedulaIdentidad: personas.cedulaIdentidad,
          nombresApellidos: personas.nombresApellidos,
          tipo: personas.tipo,
          anioTitulacion: personas.anioTitulacion,
          anioEgreso: personas.anioEgreso,
          modalidadTitulacion: personas.modalidadTitulacion,
          sectorTrabajo: personas.sectorTrabajo,
          ciudadRegionTrabajo: personas.ciudadRegionTrabajo,
        })
        .from(personas)
        .where(condDetalle)
        .orderBy(personas.nombresApellidos)
        .limit(5000);

      detalle = filas as unknown as Array<Record<string, unknown>>;
    }

    const buffer = await generarReportePdf({
      vista: vista as "TITULADOS" | "EGRESADOS" | "COMPARATIVO",
      kpis: {
        totalTitulados: t?.total ?? 0,
        tasaEmpleabilidadTitulados: pct(t?.empleados ?? 0, t?.total ?? 0),
        tiempoPromedioEgresoTitulacion: t?.promEgrTit ?? 0,
        tiempoPromedioInsercionTitulados: t?.promInsercion ?? 0,
        porcentajeEmpleoEstadistica: pct(t?.enEstadistica ?? 0, t?.empleados ?? 0),
        totalEgresados: e?.total ?? 0,
        tasaEmpleabilidadEgresados: pct(e?.empleados ?? 0, e?.total ?? 0),
        tiempoPromedioInsercionEgresados: e?.promInsercion ?? 0,
      },
      porAnio,
      sectoresTitulados: aSectores("TITULADO"),
      sectoresEgresados: aSectores("EGRESADO"),
      geografiaTitulados: aGeo("TITULADO"),
      geografiaEgresados: aGeo("EGRESADO"),
      cohortes,
      modalidades: modalidades.map((m) => ({ modalidad: m.modalidad, total: m.n })),
      motivos: motivos.map((m) => ({ motivo: m.motivo, total: m.n })),
      personas: detalle,
    });

    const sello = new Date().toISOString().slice(0, 10);

    await registrarAuditoria({
   accion: "exportar",
      entidad: "dashboard",
      idUsuario: sesion.sub,
      detalles: `Reporte PDF · ${vista} · detalle=${conDetalle ? "sí" : "no"} · ${(buffer.length / 1024).toFixed(0)} KB`,
      req,
    });

    // NextResponse espera un BodyInit del DOM; Buffer sirve solo si se le da su
    // ArrayBuffer subyacente.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Reporte_Seguimiento_${vista}_${sello}.pdf"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    return errorInterno(e, "api/exportar/pdf");
  }
}