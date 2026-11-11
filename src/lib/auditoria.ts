import { pool } from "@/db";
import { type NuevoAuditLogEntry } from "@/db/schema";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Registro de actividad (ISO/IEC 27001:2022, A.8.16 "Logging"; en la edición 2013 era
 * A.8.15, de donde procede el requisito original del proyecto).
 *
 * Cada fila guarda el SHA-256 de su contenido junto al hash de la fila anterior. La
 * cadena hace que una modificación silenciosa de una fila antigua sea detectable.
 *
 * ⚠ CONCURRENCIA: la cadena exige que dos escrituras simultáneas no intercalen sus
 * filas, o la cadena se rompe sola (y sería un falso positivo). Por eso el INSERT va
 * dentro de una transacción con `SELECT ... FOR UPDATE` sobre la última fila: el
 * segundo escritor espera al primero. Con un pool de 20 conexiones esto serializa las
 * escrituras de auditoría, lo cual es aceptable: son pocas y deben quedar ordenadas.
 *
 * ⚠ El módulo usa `node:crypto`, a diferencia de `lib/sesion.ts`. Es intencionado:
 * este código corre solo en route handlers (runtime Node), nunca en el middleware de
 * Edge, y la cadena necesita SHA-256 síncrono sobre una cadena de longitud conocida.
 */

export interface DatosAuditoria {
  accion: NuevoAuditLogEntry["accion"];
  entidad: string;
  entidadId?: number | null;
  idUsuario?: number | null;
  detalles?: string | null;
  datosAnteriores?: unknown;
  datosNuevos?: unknown;
  req?: NextRequest | null;
}

/** Extrae la IP del cliente respetando proxies (X-Forwarded-For lo pone Nginx). */
export function ipDesde(req?: NextRequest | null): string | null {
  if (!req) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 45);
  return req.headers.get("x-real-ip")?.slice(0, 45) ?? null;
}

/**
 * Campos que entran en el hash. El orden es FIJO a propósito: si se calculara sobre el
 * JSON serializado, reordenar las claves del objeto cambiaría el hash sin que cambie
 * el contenido, y la verificación daría un falso negativo.
 *
 * `creadoEn` NO entra, y es deliberado. La columna es `timestamp without time zone`, así
 * que el driver la devuelve como un `Date` interpretado en la zona horaria del SERVIDOR:
 * si el proceso que verifica corre en una zona distinta de la que escribió, el mismo
 * instante produce dos cadenas distintas y la cadena aparecería rota sin que lo esté.
 *
 * La fecha sigue protegida sin estar en el hash: las filas se ordenan por `id` (un
 * `serial`, que no se puede reasignar) y la tabla es de solo-INSERT, así que no se puede
 * reordenar; y alterar el contenido de una fila sí rompe el hash de esa fila. Lo que el
 * hash protege frente a la manipulación del contenido —que es lo que importa— sigue
 * intacto.
 */
function cadenaDeHash(fila: Omit<NuevoAuditLogEntry, "hash" | "hashAnterior">): string {
  return [
    fila.idUsuario ?? "",
    fila.accion,
    fila.entidad,
    fila.entidadId ?? "",
    fila.detalles ?? "",
    fila.datosAnteriores ?? "",
    fila.datosNuevos ?? "",
    fila.ip ?? "",
  ].join("");
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Escribe una entrada en `audit_log`, encadenada con la fila anterior.
 *
 * Nunca lanza: la auditoría no puede tumbar la operación principal que la originó (un
 * error al registrar no debe impedir que un egresado actualice su perfil). El fallo sí
 * se escribe en la consola del servidor, que es donde el operador puede verlo; no se
 * "traga en silencio" como antes, que era indistinguible de un registro correcto.
 */
export async function registrarAuditoria(datos: DatosAuditoria): Promise<void> {
  const filaBase: Omit<NuevoAuditLogEntry, "hash" | "hashAnterior"> = {
    idUsuario: datos.idUsuario ?? null,
    accion: datos.accion,
    entidad: datos.entidad,
    entidadId: datos.entidadId ?? null,
    detalles: datos.detalles ?? null,
    datosAnteriores: datos.datosAnteriores ? JSON.stringify(datos.datosAnteriores) : null,
    datosNuevos: datos.datosNuevos ? JSON.stringify(datos.datosNuevos) : null,
    ip: ipDesde(datos.req),
    creadoEn: new Date(),
  };

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    // Serializa a los escritores concurrentes y da el hash de la última fila escrita.
    const anterior = await cliente.query<{ hash: string | null }>(
      "SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );
    const hashAnterior = anterior.rows[0]?.hash ?? null;

    const hash = sha256(`${hashAnterior ?? ""}${cadenaDeHash(filaBase)}`);

    await cliente.query(
      `INSERT INTO audit_log
         (id_usuario, accion, entidad, entidad_id, detalles, datos_anteriores, datos_nuevos, ip, creado_en, hash_anterior, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        filaBase.idUsuario,
        filaBase.accion,
        filaBase.entidad,
        filaBase.entidadId,
        filaBase.detalles,
        filaBase.datosAnteriores,
        filaBase.datosNuevos,
        filaBase.ip,
        filaBase.creadoEn,
        hashAnterior,
        hash,
      ]
    );

    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    // No relanza: la acción del usuario ya ocurrió y no debe revertirse por un fallo de
    // registro. Queda la traza en el log del servidor, que es el canal del operador.
    console.error("[auditoria] no se pudo registrar la entrada:", e);
  } finally {
    cliente.release();
  }
}

export interface ResultadoVerificacion {
  total: number;
  cadenaIntegra: boolean;
  /** `id` de la primera fila cuya cadena no cuadra, si la hay. */
  primeraFilaAlterada: number | null;
}

/**
 * Recorre la cadena completa y devuelve en qué punto deja de cuadrar.
 *
 * Es la contraparte de `registrarAuditoria`: sin esto, el hash solo es decorativo,
 * porque nadie lo comprobaría. Se ejecuta bajo demanda (no en cada escritura) porque es
 * un recorrido completo de la tabla.
 */
export async function verificarCadenaAuditoria(): Promise<ResultadoVerificacion> {
  const filas = await pool.query<{
    id: number;
    id_usuario: number | null;
    accion: string;
    entidad: string;
    entidad_id: number | null;
    detalles: string | null;
    datos_anteriores: string | null;
    datos_nuevos: string | null;
    ip: string | null;
    creado_en: Date;
    hash_anterior: string | null;
    hash: string;
  }>("SELECT * FROM audit_log ORDER BY id ASC");

  let hashAnterior: string | null = null;
  for (const f of filas.rows) {
    const base: Omit<NuevoAuditLogEntry, "hash" | "hashAnterior"> = {
      idUsuario: f.id_usuario,
      accion: f.accion as NuevoAuditLogEntry["accion"],
      entidad: f.entidad,
      entidadId: f.entidad_id,
      detalles: f.detalles,
      datosAnteriores: f.datos_anteriores,
      datosNuevos: f.datos_nuevos,
      ip: f.ip,
      creadoEn: f.creado_en,
    };
    const esperado = sha256(`${hashAnterior ?? ""}${cadenaDeHash(base)}`);
    if (esperado !== f.hash || f.hash_anterior !== hashAnterior) {
      return { total: filas.rows.length, cadenaIntegra: false, primeraFilaAlterada: f.id };
    }
    hashAnterior = f.hash;
  }

  return { total: filas.rows.length, cadenaIntegra: true, primeraFilaAlterada: null };
}