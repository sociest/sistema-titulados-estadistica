/**
 * Utilidades del respaldo lógico generado por la propia aplicación.
 *
 * Regla `reglas/important.md` §2: el respaldo NO puede depender de `pg_dump`. La
 * imagen de producción (Node/Next) no trae el cliente de PostgreSQL, así que el
 * respaldo se genera consultando la base a través del ORM y serializando el
 * resultado en memoria. Este módulo concentra la lista de tablas y el escapado de
 * valores para que la ruta `/api/respaldar` y el script `scripts/backup.sh`
 * compartan una única definición.
 */
import {
  personas,
  usuarios,
  sesiones,
  noticiasCursos,
  solicitudTitulado,
  solicitudTituladoHistorial,
  solicitudTituladoDocumento,
  carreras,
  verificaciones,
  auditLog,
} from "@/db/schema";

/**
 * Nombre real de cada tabla en PostgreSQL (coincide con el esquema Drizzle).
 * Se usa tanto para la clave JSON como para `INSERT INTO <nombre>`.
 */
export const TABLAS_RESPALDO: Array<{ nombre: string; tabla: unknown }> = [
  { nombre: "personas", tabla: personas },
  { nombre: "carreras", tabla: carreras },
  { nombre: "usuarios", tabla: usuarios },
  { nombre: "sesiones", tabla: sesiones },
  { nombre: "verificaciones", tabla: verificaciones },
  { nombre: "noticias_cursos", tabla: noticiasCursos },
  { nombre: "solicitudtitulado", tabla: solicitudTitulado },
  { nombre: "solicitudtitulado_historial", tabla: solicitudTituladoHistorial },
  { nombre: "solicitudtitulado_documentos", tabla: solicitudTituladoDocumento },
  { nombre: "audit_log", tabla: auditLog },
];

/** Escapa un valor para una sentencia INSERT. `null` va como NULL, nunca como ''. */
export function literalSql(valor: unknown): string {
  if (valor === null || valor === undefined) return "NULL";
  if (valor instanceof Date) return `'${valor.toISOString()}'`;
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "NULL";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (Buffer.isBuffer(valor)) return `'\\x${valor.toString("hex")}'`;
  return `'${String(valor).replace(/'/g, "''")}'`;
}
