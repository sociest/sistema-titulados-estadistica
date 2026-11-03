import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { leerSesionDeRequest } from "@/lib/sesion";
import { errorInterno } from "@/lib/guards";
import { aFiltroEnum } from "@/lib/filtros";
import { envolverIndicador } from "@/lib/privacidad";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 *
 * CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR:
 *  1. Todos los cálculos se hacen en SQL (`COUNT FILTER`, `AVG`, `GROUP BY`) en vez de
 *     traer la tabla entera y filtrar en JavaScript. `important.md` §3 lo exige: "usar
 *     agrupaciones directamente desde la BD en lugar de procesar grandes volúmenes de
 *     arrays en JS".
 *  2. Ya no se devuelve `error.message` al cliente.
 *  3. `?scope=admin` exige rol admin; el scope público (sin filtros) queda abierto para
 *     que la sección pública del sitio muestre los indicadores.
 */

type Cond = SQL | undefined;

function construirFiltros(searchParams: URLSearchParams) {
  const sector = searchParams.get("sector");
  const modalidad = searchParams.get("modalidad");

  const conds: SQL[] = [];

  // Se aplican siempre, antes que cualquier filtro del usuario, y NO cuentan como
  // "filtro" a efectos de `hayFiltros` (por eso el contador de usuario va aparte):
  //   · D3 baja lógica: un registro dado de baja no cuenta para la acreditación.
  //   · D5 alta pública: una solicitud PENDIENTE o RECHAZADA tampoco, hasta que un
  //     administrador la valide.
  conds.push(eq(personas.activo, true), eq(personas.estadoRegistro, "VALIDADO"));
  const filtrosUsuario = conds.length;

  const anioMinRaw = searchParams.get("anioMin");
  const anioMaxRaw = searchParams.get("anioMax");
  const anioMin = anioMinRaw ? parseInt(anioMinRaw, 10) : null;
  const anioMax = anioMaxRaw ? parseInt(anioMaxRaw, 10) : null;

  const sectorValido = aFiltroEnum(personas.sectorTrabajo, sector);
  if (sectorValido) conds.push(eq(personas.sectorTrabajo, sectorValido));
  if (modalidad && modalidad !== "TODAS")
    conds.push(eq(personas.modalidadTitulacion, aFiltroEnum(personas.modalidadTitulacion, modalidad, "TODAS")!));
  if (anioMin !== null && Number.isFinite(anioMin))
    conds.push(sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) >= ${anioMin}`);
  if (anioMax !== null && Number.isFinite(anioMax))
    conds.push(sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) <= ${anioMax}`);

  const where: Cond = conds.length ? and(...conds) : undefined;
  return { where, hayFiltros: conds.length > filtrosUsuario };
}

/** Coalesce de columnas de enum a texto, para agrupar por nombre legible. */


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const sesion = await leerSesionDeRequest(request);

    // El dashboard con filtros o el administrativo exige admin.
    if (scope === "admin" && sesion?.rol !== "admin") {
      return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
    }

    const { where, hayFiltros } = construirFiltros(searchParams);
    if (hayFiltros && sesion?.rol !== "admin") {
      return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
    }

    // ── 1) KPIs por tipo, en una sola pasada agregada ──────────────────────────
    const kpis = await db
      .select({
        tipo: personas.tipo,
        total: sql<number>`count(*)::int`,
        empleados: sql<number>`count(*) filter (where ${personas.estadoLaboral} in ('EMPLEADO','INDEPENDIENTE'))::int`,
        enEstadistica: sql<number>`count(*) filter (where ${personas.estadoLaboral} in ('EMPLEADO','INDEPENDIENTE') and ${personas.trabajaEnEstadistica} is true)::int`,
        promEgresoTitulacion: sql<number>`coalesce(round(avg(${personas.tiempoEgresoTitulacionMeses})::numeric, 2), 0)::float`,
        promInsercion: sql<number>`coalesce(round(avg(${personas.tiempoInsercionLaboralMeses})::numeric, 2), 0)::float`,
        anioMin: sql<number>`min(coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}))::int`,
        anioMax: sql<number>`max(coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}))::int`,
      })
      .from(personas)
      .where(where)
      .groupBy(personas.tipo);

    const tRow = kpis.find((k) => k.tipo === "TITULADO");
    const eRow = kpis.find((k) => k.tipo === "EGRESADO");

    const totalTitulados = tRow?.total ?? 0;
    const emplTitulados = tRow?.empleados ?? 0;
    const totalEgresados = eRow?.total ?? 0;
    const emplEgresados = eRow?.empleados ?? 0;
    const enEstadistica = tRow?.enEstadistica ?? 0;

    const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 10000) / 100 : 0);

    // ── 2) Series por año ─────────────────────────────────────────────────────
    const anios = await db
      .select({
        anio: sql<number>`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso})::int`,
        tipo: personas.tipo,
        n: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(and(where, sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) is not null`))
      .groupBy(
        sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso})`,
        personas.tipo
      )
      .orderBy(sql`1`);

    const mapaAnios = new Map<number, { titulados: number; egresados: number }>();
    for (const fila of anios) {
      if (!fila.anio) continue;
      const actual = mapaAnios.get(fila.anio) ?? { titulados: 0, egresados: 0 };
      if (fila.tipo === "TITULADO") actual.titulados += fila.n;
      else actual.egresados += fila.n;
      mapaAnios.set(fila.anio, actual);
    }
    const seriesPorAnio = Array.from(mapaAnios.entries())
      .map(([anio, v]) => ({ anio, titulados: v.titulados, egresados: v.egresados }))
      .sort((a, b) => a.anio - b.anio);

    // ── 3) Sector laboral ─────────────────────────────────────────────────────
    const ETIQUETAS: Record<string, string> = {
      PUBLICO: "Público",
      PRIVADO: "Privado",
      ACADEMICO: "Académico / Investigación",
      ONG: "ONG / Fundaciones",
      OTRO: "Otro",
      NO_ESPECIFICADO: "Sin Especificar",
    };

    // Las expresiones agrupadas se reutilizan tal cual en SELECT y GROUP BY. Usar la
    // referencia posicional `sql`1`` es frágil: cualquier cambio en la expresión (como un
    // cast a texto) la desalinea y PostgreSQL exige que la columna esté en el GROUP BY.
    const exprSector = sql<string>`coalesce(case when ${personas.sectorTrabajo} = 'OTRO'
        then coalesce(nullif(trim(${personas.sectorTrabajoOtro}), ''), 'OTRO')
        else ${personas.sectorTrabajo}::text end, 'NO_ESPECIFICADO')`;

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

    const aSeries = (tipo: string) =>
      sectores
        .filter((s) => s.tipo === tipo)
        .map((s) => ({ key: s.key, name: ETIQUETAS[s.key] ?? s.key, valor: s.n }));

    // ── 4) Distribución geográfica ────────────────────────────────────────────
    const exprCiudad = sql<string>`coalesce(nullif(trim(${personas.ciudadRegionTrabajo}), ''), 'No especificado')`;

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

    const aGeo = (tipo: string) =>
      geos
        .filter((g) => g.tipo === tipo)
        .map((g) => ({ ciudad: g.ciudad, total: g.n }));

    // ── 5) Cohortes (titulados vs egresados) ─────────────────────────────────
    const cohortes = await db
      .select({
        cohorte: sql<string>`coalesce(nullif(trim(${personas.semestreIngreso}), ''), 'No registrado')`,
        titulados: sql<number>`count(*) filter (where ${personas.tipo} = 'TITULADO')::int`,
        egresados: sql<number>`count(*) filter (where ${personas.tipo} = 'EGRESADO')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    // ── 6) Modalidades de titulación ──────────────────────────────────────────
    const modalidades = await db
      .select({
        modalidad: sql<string>`coalesce(${personas.modalidadTitulacion}::text, 'Sin especificar')`,
        total: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(and(where, eq(personas.tipo, "TITULADO")))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);

    // ── 7) Motivos de no titulación ───────────────────────────────────────────
    const motivos = await db
      .select({
        motivo: sql<string>`coalesce(${personas.motivoNoTitulacion}::text, 'Sin especificar')`,
        total: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(and(where, eq(personas.tipo, "EGRESADO"), sql`${personas.motivoNoTitulacion} is not null`))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);

    // ── 8) Rango de años disponible, para los filtros de la UI ────────────────
    const anioMinGlobal = kpis.reduce<number | null>(
      (min, k) => (k.anioMin == null ? min : min == null ? k.anioMin : Math.min(min, k.anioMin)),
      null
    );
    const anioMaxGlobal = kpis.reduce<number | null>(
      (max, k) => (k.anioMax == null ? max : max == null ? k.anioMax : Math.max(max, k.anioMax)),
      null
    );

    return NextResponse.json({
      // `envolverIndicador` solo oculta el valor cuando NO hay muestra alguna (total 0).
      // No hay umbral k: los conteos agregados se publican siempre.
      kpisTitulados: {
        ...envolverIndicador(totalTitulados, totalTitulados),
        metric_value: envolverIndicador(
          pct(emplTitulados, totalTitulados),
          totalTitulados
        ).metric_value,
        totalTitulados,
        tasaEmpleabilidadTitulados: pct(emplTitulados, totalTitulados),
        tiempoPromedioEgresoTitulacion: tRow?.promEgresoTitulacion ?? 0,
        tiempoPromedioInsercionTitulados: tRow?.promInsercion ?? 0,
        porcentajeEmpleoEstadistica: pct(enEstadistica, emplTitulados),
      },
      kpisEgresados: {
        ...envolverIndicador(totalEgresados, totalEgresados),
        metric_value: envolverIndicador(
          pct(emplEgresados, totalEgresados),
          totalEgresados
        ).metric_value,
        totalEgresados,
        tasaEmpleabilidadEgresados: pct(emplEgresados, totalEgresados),
        tiempoPromedioInsercionEgresados: eRow?.promInsercion ?? 0,
      },
      seriesPorAnio,
      seriesSectorTitulados: aSeries("TITULADO"),
      seriesSectorEgresados: aSeries("EGRESADO"),
      seriesGeoTitulados: aGeo("TITULADO"),
      seriesGeoEgresados: aGeo("EGRESADO"),
      tablaCohortes: cohortes,
      seriesModalidades: modalidades,
      seriesMotivosNoTitulacion: motivos,
      rangoAnios: { min: anioMinGlobal, max: anioMaxGlobal },
      // Sin umbral k, no hay nada que anunciar sobre ocultamiento de celdas. Se declara
      // igualmente el modelo para que la interfaz pueda explicar al visitante por qué
      // ve conteos y no fichas.
      privacidad: { modelo: "agregados sin datos identificativos", umbralK: null },
    });
  } catch (error: unknown) {
    return errorInterno(error, "api/dashboard");
  }
}