import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { aFiltroEnum, aValorEnum } from "@/lib/filtros";
import { sanearReporte } from "@/lib/privacidad";

export const dynamic = "force-dynamic";

/**
 * GET /api/exportar/preview  (SOLO ADMIN)
 *
 * Muestra los primeros 50 registros del reporte que se va a descargar. No exige firma
 * temporal: no devuelve datos de una persona distinta de las que el propio admin está
 * ya viendo en su sesión, y no genera un archivo fuera de su máquina.
 */
export async function GET(request: NextRequest) {
  const denegado = await exigirAdmin(request);
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") || "TODOS";
    const sector = searchParams.get("sector");
    const modalidad = searchParams.get("modalidad");

    const conditions = [];

    // Baja lógica (decisión D3): lo dado de baja queda fuera de los reportes. Para
    // incluirlo hay que pedirlo expresamente con ?incluirBajas=true.
    if (searchParams.get("incluirBajas") !== "true") {
      conditions.push(eq(personas.activo, true), eq(personas.estadoRegistro, "VALIDADO"));
    }

    if (tipo === "TITULADOS") {
      conditions.push(eq(personas.tipo, "TITULADO"));
    } else if (tipo === "EGRESADOS") {
      conditions.push(eq(personas.tipo, "EGRESADO"));
    }

    const anioMinRaw = searchParams.get("anioMin");
    const anioMaxRaw = searchParams.get("anioMax");
    const anioMin = anioMinRaw ? parseInt(anioMinRaw, 10) : null;
    const anioMax = anioMaxRaw ? parseInt(anioMaxRaw, 10) : null;

    if (sector && sector !== "TODOS") {
      const sectorValido = aFiltroEnum(personas.sectorTrabajo, sector);
    if (sectorValido) conditions.push(eq(personas.sectorTrabajo, sectorValido));
    }

    if (modalidad && modalidad !== "TODAS") {
      const modalidadValida = aFiltroEnum(personas.modalidadTitulacion, modalidad, "TODAS");
    if (modalidadValida) conditions.push(eq(personas.modalidadTitulacion, modalidadValida));
    }

    if (anioMin !== null && Number.isFinite(anioMin)) {
      conditions.push(
        sql`COALESCE(${personas.anioTitulacion}, ${personas.anioEgreso}) >= ${anioMin}`
      );
    }

    if (anioMax !== null && Number.isFinite(anioMax)) {
      conditions.push(
        sql`COALESCE(${personas.anioTitulacion}, ${personas.anioEgreso}) <= ${anioMax}`
      );
    }

    const registros = await db
      .select()
      .from(personas)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(50);

    // Mismo saneamiento que en la exportación real. La vista previa se renderiza con
    // React, que escapa el contenido, así que aquí no hay XSS; pero la casilla "Sí,
    // exportar" sugiere que lo que se ve es lo que se descarga, y si el archivo lleva
    // un apóstrofo added al inicio y la vista previa no, la previsualización miente.
    const dataPreview = sanearReporte(
      registros.map((r, idx) => ({
      "N°": idx + 1,
      Tipo: r.tipo,
      "Cédula de Identidad (K)": r.cedulaIdentidad,
      "Nombres y Apellidos (K)": r.nombresApellidos,
      "Género (K)": r.genero,
      "Semestre Ingreso (K)": r.semestreIngreso || "—",
      "Semestre Egreso (K)": r.semestreEgreso || "—",
      "Año Titulación (K)": r.anioTitulacion || "—",
      "Modalidad Titulación (K)": r.modalidadTitulacion || "—",
      "Área de Especialización (K)": r.areaEspecializacion || "—",
      "Planea Titularse (Egresados)": r.planeaTitularse || "—",
      "Inició Proceso Titulación": r.inicioProcesoTitulacion || "—",
      "Motivo No Titulación": r.motivoNoTitulacion || "—",
      "Estado Laboral": r.estadoLaboral || "—",
      "Sector de Trabajo": r.sectorTrabajo || "—",
      "Sector Otro (especificado)": r.sectorTrabajo === "OTRO" ? (r.sectorTrabajoOtro || "—") : "—",
      "Ocupación / Cargo": r.ocupacionCargo || "—",
      "Trabaja en Estadística": r.trabajaEnEstadistica ? "SÍ" : "NO",
      "Ubicación Geográfica": r.ciudadRegionTrabajo || "—",
      "T. Egreso-Titulación (meses)": r.tiempoEgresoTitulacionMeses ?? "—",
      "T. Inserción Laboral (meses)": r.tiempoInsercionLaboralMeses ?? "—",
      "Correo Electrónico": r.correoElectronico || "—",
      Teléfono: r.telefono || "—",
      "Redes Sociales": r.redesSociales || "—",
      Observaciones: r.observaciones || "—",
      }))
    );

    return NextResponse.json({
      total: registros.length,
      data: dataPreview,
    });
  } catch (error: unknown) {
    return errorInterno(error, "api/exportar/preview");
  }
}
