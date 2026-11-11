import { pool } from "@/db";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ipDesde } from "@/lib/auditoria";
import type { CambioCampo } from "@/lib/diff";

/**
 * Auditoría por tipo de objeto. Cada tabla tiene su propia cadena de hash:
 *   audit_noticias  → noticias y convocatorias
 *   audit_personas  → titulados y egresados
 * Cada fila guarda: usuario, rol, acción, estado anterior, estado nuevo y el detalle
 * campo a campo (cambios). Los JSON se guardan como TEXTO para que el hash sea
 * reproducible (jsonb reordena claves y rompería la verificación).
 */

export type TablaAuditoria = "audit_noticias" | "audit_personas";

export interface RegistroCambio {
  tabla: TablaAuditoria;
  accion: "crear" | "editar" | "eliminar";
  entidadId: number;
  idUsuario: number | null;
  rol: string | null;
  anterior: unknown;
  nuevo: unknown;
  cambios: CambioCampo[];
  req?: NextRequest | null;
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/** Escribe una fila encadenada. Nunca lanza: la operación principal ya ocurrió. */
export async function registrarCambio(r: RegistroCambio): Promise<void> {
  // La tabla viene de una lista cerrada (TablaAuditoria), nunca de entrada del usuario.
  const tabla: TablaAuditoria = r.tabla;
  const datosAnteriores = r.anterior == null ? null : JSON.stringify(r.anterior);
  const datosNuevos = r.nuevo == null ? null : JSON.stringify(r.nuevo);
  const cambios = JSON.stringify(r.cambios);
  const ip = ipDesde(r.req);

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const previo = await cliente.query<{ hash: string }>(
      `SELECT hash FROM ${tabla} ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    const hashAnterior = previo.rows[0]?.hash ?? null;
    const hash = sha256(
      [
        hashAnterior ?? "",
        r.idUsuario ?? "",
        r.rol ?? "",
        r.accion,
        r.entidadId,
        datosAnteriores ?? "",
        datosNuevos ?? "",
        cambios,
        ip ?? "",
      ].join("|")
    );
    await cliente.query(
      `INSERT INTO ${tabla}
         (id_usuario, rol, accion, entidad_id, datos_anteriores, datos_nuevos, cambios, ip, hash_anterior, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [r.idUsuario, r.rol, r.accion, r.entidadId, datosAnteriores, datosNuevos, cambios, ip, hashAnterior, hash]
    );
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    console.error(`[auditoria:${tabla}] no se pudo registrar:`, e);
  } finally {
    cliente.release();
  }
}
