import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  personas,
  usuarios,
  sesiones,
  noticiasCursos as noticias,
  solicitudTitulado,
  solicitudTituladoHistorial,
  solicitudTituladoDocumento,
  carreras,
  verificaciones,
  auditLog,
} from "@/db/schema";
import { errorInterno, exigirAdmin } from "@/lib/guards";
import { sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * GET /api/respaldar → respaldo completo de la base de datos, EN MEMORIA.
 *
 * Por qué NO `pg_dump` (regla `reglas/important.md` §2):
 *   - `pg_dump` es un binario del SISTEMA. La imagen de producción (Node/Next) no lo
 *     incluye, así que el respaldo fallaría justo cuando hace falta.
 *   - `child_process.exec` tampoco es una salida: en despliegues efímeros no hay disco.
 *
 * Por qué esto sí funciona en cualquier entorno:
 *   - Se consulta la base a través del ORM (Drizzle), que ya está en la aplicación.
 *   - Se serializa el contenido en JSON y se entrega como STREAM en memoria.
 *   - No se escribe ningún archivo en el disco: el respaldo nace y muere en el proceso.
 *
 * Solo admin: un respaldo contiene la base completa, con cédulas, correos y teléfonos.
 * Cada descarga queda anotada en `audit_log` como evento `exportar`.
 *
 * Parámetros:
 *   ?formato=json  (por defecto)  → volcado legible y reutilizable por cualquier
 *                                    herramienta sin depender de PostgreSQL
 *   ?formato=sql                  → sentencias INSERT generadas desde los mismos datos
 */

/**
 * Nombre real de cada tabla en PostgreSQL (coincide con el esquema Drizzle).
 * Se usa tanto para la clave JSON como para `INSERT INTO <nombre>`.
 */
const TABLAS: Array<{ nombre: string; tabla: unknown }> = [
  { nombre: "personas", tabla: personas },
  { nombre: "carreras", tabla: carreras },
  { nombre: "usuarios", tabla: usuarios },
  { nombre: "sesiones", tabla: sesiones },
  { nombre: "verificaciones", tabla: verificaciones },
  { nombre: "noticias_cursos", tabla: noticias },
  { nombre: "solicitudtitulado", tabla: solicitudTitulado },
  { nombre: "solicitudtitulado_historial", tabla: solicitudTituladoHistorial },
  { nombre: "solicitudtitulado_documentos", tabla: solicitudTituladoDocumento },
  { nombre: "audit_log", tabla: auditLog },
];

/** Escapa un valor para una sentencia INSERT. `null` va como NULL, nunca como ''. */
function literal(valor: unknown): string {
  if (valor === null || valor === undefined) return "NULL";
  if (valor instanceof Date) return `'${valor.toISOString()}'`;
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "NULL";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (Buffer.isBuffer(valor)) return `'\\x${valor.toString("hex")}'`;
  return `'${String(valor).replace(/'/g, "''")}'`;
}

export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const formato = (new URL(req.url).searchParams.get("formato") ?? "json").toLowerCase();
    if (formato !== "json" && formato !== "sql") {
      return NextResponse.json(
        { error: "Formato no soportado. Use formato=json o formato=sql." },
        { status: 400 }
      );
    }

    // Recuento previo: el respaldo debe poder afirmar cuántos registros respalda.
    const conteos: Record<string, number> = {};
    for (const { nombre, tabla } of TABLAS) {
      const fila = (await db
        .select({ total: sql<number>`count(*)::int` })
        .from(tabla as never)) as unknown as Array<{ total: number }>;
      conteos[nombre] = fila[0]?.total ?? 0;
    }

    const sello = new Date().toISOString().replace(/[:.]/g, "-");
    const nombreArchivo = `respaldo_sistema_${sello}.${formato}`;

    const codigoAuditoria = registrarAuditoria({
      accion: "exportar",
      entidad: "respaldo",
      detalles: `Respaldo completo en memoria · formato ${formato} · ${
        Object.entries(conteos)
          .map(([t, n]) => `${t}=${n}`)
          .join(", ")
      }`,
      req,
    });

    const origen = new URL(req.url).origin;

    if (formato === "json") {
      const stream = new ReadableStream({
        async start(control) {
          const enc = new TextEncoder();
          const enviar = (s: string) => control.enqueue(enc.encode(s));

          // Un solo objeto JSON válido: { respaldo, generadoEn, generadoPor, nota, conteos, datos: { tabla: filas, ... } }
          const datos: Record<string, unknown> = {};
          for (const { nombre, tabla } of TABLAS) {
            const filas = (await db.select().from(tabla as never)) as Record<string, unknown>[];
            datos[nombre] = filas;
          }

          const payload = {
            respaldo: "Sistema de Seguimiento a Titulados y Egresados",
            generadoEn: new Date().toISOString(),
            generadoPor: origen,
            nota: "Volcado en memoria generado desde la aplicación; no requiere pg_dump.",
            conteos,
            datos,
          };

          enviar(JSON.stringify(payload, null, 2));
          enviar("\n");

          await codigoAuditoria;
          control.close();
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // ── formato SQL: sentencias INSERT listas para restaurar ──────────────────
    const stream = new ReadableStream({
      async start(control) {
        const enc = new TextEncoder();
        const enviar = (s: string) => control.enqueue(enc.encode(s));

        enviar(`-- Respaldo generado por la aplicación el ${new Date().toISOString()}\n`);
        enviar("-- No requiere pg_dump: se genera desde el ORM en memoria.\n");
        enviar("BEGIN;\n");
        for (const { nombre, tabla } of TABLAS) {
          const filas = (await db.select().from(tabla as never)) as Record<string, unknown>[];
          for (const fila of filas) {
            const columnas = Object.keys(fila);
            enviar(
              `INSERT INTO ${nombre} (${columnas.join(", ")}) VALUES (${columnas
                .map((c) => literal(fila[c]))
                .join(", ")});\n`
            );
          }
        }
        enviar("COMMIT;\n");
        await codigoAuditoria;
        control.close();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    return errorInterno(error, "api/respaldar");
  }
}
