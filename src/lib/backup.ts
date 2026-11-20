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
/**
 * Definición cerrada de las tablas incluidas en el respaldo lógico.
 *
 * Incluye `credenciales_persona`, `audit_noticias` y `audit_personas` para que una
 * restauración preserve contraseñas de titulares y toda la evidencia de auditoría.
 * Excluye `sesiones` y `verificaciones` porque contienen tokens temporales activos.
 */
export interface DefinicionTablaRespaldo {
  nombre: string;
  pk: string;
  secuencia?: boolean;
}

export const TABLAS_RESPALDO: ReadonlyArray<DefinicionTablaRespaldo> = [
  { nombre: "usuarios", pk: "id", secuencia: true },
  { nombre: "personas", pk: "id", secuencia: true },
  { nombre: "credenciales_persona", pk: "id_persona", secuencia: false },
  { nombre: "carreras", pk: "id", secuencia: true },
  { nombre: "noticias_cursos", pk: "id", secuencia: true },
  { nombre: "solicitudtitulado", pk: "id", secuencia: true },
  { nombre: "solicitudtitulado_historial", pk: "id", secuencia: true },
  { nombre: "solicitudtitulado_documentos", pk: "id", secuencia: true },
  { nombre: "audit_log", pk: "id", secuencia: true },
  { nombre: "audit_personas", pk: "id", secuencia: true },
  { nombre: "audit_noticias", pk: "id", secuencia: true },
];

/** Escapa un identificador SQL conocido de la lista cerrada. */
export function identificadorSql(col: string): string {
  if (!/^[a-z0-9_]+$/i.test(col)) {
    throw new Error(`Identificador SQL no permitido: ${col}`);
  }
  return `"${col}"`;
}

/** Escapa un valor para una sentencia INSERT. `null` va como NULL, nunca como ''. */
export function literalSql(valor: unknown): string {
  if (valor === null || valor === undefined) return "NULL";
  if (valor instanceof Date) return `'${valor.toISOString()}'`;
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "NULL";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (Buffer.isBuffer(valor)) return `'\\x${valor.toString("hex")}'`;
  if (typeof valor === "object") {
    const json = JSON.stringify(valor).replace(/\0/g, "").replace(/'/g, "''");
    return `'${json}'`;
  }
  const limpio = String(valor).replace(/\0/g, "").replace(/'/g, "''");
  return `'${limpio}'`;
}
