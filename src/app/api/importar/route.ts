import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { sql } from "drizzle-orm";
import { exigirAdmin, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { personaAdminSchema, primerErrorZod } from "@/lib/validaciones";
import { leerCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * POST /api/importar → Importación masiva de registros desde archivo Excel o CSV.
 *
 * Restricciones de `important.md` §2: los archivos se procesan EN MEMORIA. Nunca se escribe
 * nada en disco, para que funcione igual en un servidor normal o en un contenedor efímero.
 *
 * Acepta `multipart/form-data` con el campo `archivo`, en formato:
 *   .csv   → texto UTF-8
 *   .xlsx  → se lee con la librería `xlsx` ya instalada
 *
 * Cada fila se valida con el MISMO esquema `personaAdminSchema` que usa el alta manual, así
 * que no se pueden colar datos que la pantalla no permitiría. Se devuelve un reporte con
 * las filas Okay y las rechazadas, con el motivo de cada rechazo.
 */

const MAPA: Record<string, string> = {
  tipo: "tipo",
  nombres_apellidos: "nombresApellidos",
  cedula_identidad: "cedulaIdentidad",
  genero: "genero",
  semestre_ingreso: "semestreIngreso",
  semestre_egreso: "semestreEgreso",
  anio_egreso: "anioEgreso",
  anio_titulacion: "anioTitulacion",
  modalidad_titulacion: "modalidadTitulacion",
  area_especializacion: "areaEspecializacion",
  planea_titularse: "planeaTitularse",
  inicio_proceso_titulacion: "inicioProcesoTitulacion",
  motivo_no_titulacion: "motivoNoTitulacion",
  correo_electronico: "correoElectronico",
  telefono: "telefono",
  redes_sociales: "redesSociales",
  ciudad_region_trabajo: "ciudadRegionTrabajo",
  estado_laboral: "estadoLaboral",
  sector_trabajo: "sectorTrabajo",
  sector_trabajo_otro: "sectorTrabajoOtro",
  ocupacion_cargo: "ocupacionCargo",
  trabaja_en_estadistica: "trabajaEnEstadistica",
  tiempo_egreso_titulacion_meses: "tiempoEgresoTitulacionMeses",
  tiempo_insercion_laboral_meses: "tiempoInsercionLaboralMeses",
  observaciones: "observaciones",
};

/** Acepta tanto "SI"/"sí"/"1"/"true" como el booleano de Excel. */
function aBooleano(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "si" || s === "sí" || s === "1" || s === "true" || s === "x";
}

export async function POST(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const form = await req.formData();
    const archivo = form.get("archivo");

    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }
    if (archivo.size === 0) {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    }
    // 20 MB es holgado para 50.000 filas y evita que alguien suba un video.
    if (archivo.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo supera el máximo de 20 MB" }, { status: 400 });
    }

    const nombre = archivo.name.toLowerCase();
    const buffer = Buffer.from(await archivo.arrayBuffer());

    // ── Leer el archivo a memoria ────────────────────────────────────────────
    let crudos: Record<string, unknown>[] = [];

    if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(buffer, { type: "buffer" });
      const hoja = libro.Sheets[libro.SheetNames[0]!];
      if (!hoja) {
        return NextResponse.json({ error: "El Excel no tiene hojas" }, { status: 400 });
      }
      crudos = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
    } else if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
      // Decodificar como UTF-8, con fallback a latin1 (CSV exportado desde Excel en español).
      let texto = buffer.toString("utf-8").replace(/^\uFEFF/, "");
      if (texto.includes("\uFFFD")) texto = buffer.toString("latin1");
      crudos = leerCsv(texto);
    } else {
      return NextResponse.json(
        { error: "Formato no admitido. Use un archivo .csv, .xlsx o .xls" },
        { status: 400 }
      );
    }

    if (!crudos.length) {
      return NextResponse.json({ error: "El archivo no contiene filas de datos" }, { status: 400 });
    }
    if (crudos.length > 50_000) {
      return NextResponse.json(
        { error: `El archivo tiene ${crudos.length} filas y el máximo es 50.000` },
        { status: 400 }
      );
    }

    // ── CI ya existentes ─────────────────────────────────────────────────────
    const existentes = await db.select({ ci: personas.cedulaIdentidad }).from(personas);
    const yaEnBase = new Set(existentes.map((e) => e.ci));

    const insertables: (typeof personas.$inferInsert)[] = [];
    const rechazadas: Array<{ fila: number; ci: string; motivo: string }> = [];
    const vistas = new Set<string>();

    for (let i = 0; i < crudos.length; i++) {
      const crudo = crudos[i]!;
      const filaNum = i + 2; // +1 por el encabezado, +1 porque humans cuentan desde 1

      // Traducir nombres de columna del CSV a los del esquema.
      const normalizado: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(crudo)) {
        const destino = MAPA[k.trim().toLowerCase()];
        if (destino && !(typeof v === "string" && v.trim() === "")) normalizado[destino] = v;
      }
      if ("trabajaEnEstadistica" in normalizado) {
        normalizado.trabajaEnEstadistica = aBooleano(normalizado.trabajaEnEstadistica);
      }

      const ci = String(normalizado.cedulaIdentidad ?? "").trim().toUpperCase();
      if (!ci) {
        rechazadas.push({ fila: filaNum, ci: "", motivo: "Falta la cédula de identidad" });
        continue;
      }
      if (vistas.has(ci)) {
        rechazadas.push({ fila: filaNum, ci, motivo: "Cédula repetida dentro del mismo archivo" });
        continue;
      }
      if (yaEnBase.has(ci)) {
        rechazadas.push({ fila: filaNum, ci, motivo: "La cédula ya está registrada en el sistema" });
        continue;
      }
      vistas.add(ci);

      const parseo = personaAdminSchema.safeParse(normalizado);
      if (!parseo.success) {
        rechazadas.push({ fila: filaNum, ci, motivo: primerErrorZod(parseo.error) });
        continue;
      }

      const d = parseo.data;
      const tiempoEgrTit =
        d.anioEgreso && d.anioTitulacion ? (d.anioTitulacion - d.anioEgreso) * 12 : null;

      insertables.push({ ...d, cedulaIdentidad: ci, tiempoEgresoTitulacionMeses: tiempoEgrTit });
    }

    // ── Insertar por lotes ───────────────────────────────────────────────────
    let insertadas = 0;
    const LOTE = 500;
    for (let i = 0; i < insertables.length; i += LOTE) {
      const lote = insertables.slice(i, i + LOTE);
      try {
        await db.insert(personas).values(lote);
        insertadas += lote.length;
      } catch (e) {
        // Si un lote falla, se reintenta fila por fila para no perder todo el lote.
        for (const fila of lote) {
          try {
            await db.insert(personas).values(fila);
            insertadas++;
          } catch (fe) {
            rechazadas.push({
              fila: 0,
              ci: fila.cedulaIdentidad as string,
              motivo: "Error de base de datos al insertar",
            });
          }
        }
      }
    }

    await registrarAuditoria({
      accion: "importar",
      entidad: "personas",
      idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
      detalles: `Importación desde ${archivo.name}: ${insertadas} insertadas, ${rechazadas.length} rechazadas de ${crudos.length} filas`,
      req,
    });

    return NextResponse.json({
      archivo: archivo.name,
      totalFilas: crudos.length,
      insertadas,
      rechazadas: rechazadas.length,
      // Limitar la respuesta para no enviar 50.000 errores al navegador.
      detalleRechazadas: rechazadas.slice(0, 200),
      detalleTruncado: rechazadas.length > 200,
    });
  } catch (e) {
    return errorInterno(e, "api/importar");
  }
}