import { createHash } from "crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { sesiones } from "@/db/schema";
import { NOMBRE_COOKIE } from "./sesion";
import type { NextRequest } from "next/server";

/**
 * Persistencia de sesiones (decisión D2, aprobada).
 *
 * El token de la cookie es un HMAC sobre un JSON:rk si se pierde la fila de esta
 * tabla, el token sigue siendo criptográficamente válido y las guardas lo aceptarían.
 * Aquí se guarda únicamente el SHA-256 del token, nunca el token mismo, de modo que
 * leer la base de datos no permite suplantar a nadie.
 *
 * Este módulo SÍ usa `crypto` de Node y la base de datos, así que solo puede correr
 * en el runtime de Node: nunca se importa desde `src/middleware.ts`, que corre en
 * Edge. El middleware se limita a comprobar la firma; la revocación se comprueba
 * aquí, en las guardas.
 */

const MS_POR_SEGUNDO = 1000;

/** SHA-256 en hexadecimal: 64 caracteres, que es lo que acepta `sesiones.token_hash`. */
export function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type DatosAlta = {
  /** Token crudo que se acaba de emitir. Solo se usa para calcular el SHA-256. */
  token: string;
  idUsuario?: number | null;
  idPersona?: number | null;
  ci: string;
  rol: string;
  expiracionMs: number;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Registra una sesión. Devuelve `null` si la escritura falla, porque perder el rastro
 * de auditoría no puede impedir que alguien entre al sistema: el token firmado sigue
 * siendo válido y las guardas lo aceptarán.
 */
export async function registrarSesion(datos: DatosAlta): Promise<void> {
  try {
    await db.insert(sesiones).values({
      idUsuario: datos.idUsuario ?? null,
      idPersona: datos.idPersona ?? null,
      ci: (datos.ci ?? "").trim().toUpperCase(),
      rol: datos.rol,
      tokenHash: hashDeToken(datos.token),
      creadaEn: new Date(),
      ultimaActividadEn: new Date(),
      expiraEn: new Date(Date.now() + datos.expiracionMs),
      ip: datos.ip ?? null,
      userAgent: datos.userAgent ?? null,
    });
  } catch (e) {
    console.error("[sesiones] no se pudo registrar la sesión:", e);
  }
}

/** ¿Existe la fila de esta sesión y sigue viva? */
export async function sesionEstaVigente(token: string): Promise<boolean> {
  try {
    const filas = await db
      .select({ id: sesiones.id })
      .from(sesiones)
      .where(
        and(
          eq(sesiones.tokenHash, hashDeToken(token)),
          isNull(sesiones.revocadaEn),
          gt(sesiones.expiraEn, new Date())
        )
      )
      .limit(1);
    return filas.length > 0;
  } catch (e) {
    // Si no se puede leer la tabla de sesiones, se niega el acceso: no dejamos pasar
    // a ciegas cuando la base de datos está caída o inaccesible.
    console.error("[sesiones] no se pudo verificar la vigencia:", e);
    return false;
  }
}

/** Revoca una sesión concreta. Es lo que hace el cierre de sesión. */
export async function revocarSesion(token: string, motivo: string): Promise<void> {
  try {
    await db
      .update(sesiones)
      .set({ revocadaEn: new Date(), motivoRevocacion: motivo.slice(0, 120) })
      .where(and(eq(sesiones.tokenHash, hashDeToken(token)), isNull(sesiones.revocadaEn)));
  } catch (e) {
    console.error("[sesiones] no se pudo revocar:", e);
  }
}

/**
 * Cierra todas las sesiones abiertas de una identidad menos la actual. Se llama tras
 * un cambio de contraseña: si alguien la hubiera copiado, el acceso se corta igual.
 */
export async function revocarOtrasSesiones(
  identidad: { idUsuario?: number | null; ci?: string | null },
  tokenActual: string,
  motivo: string
): Promise<number> {
  try {
    const condicion = identidad.idUsuario
      ? eq(sesiones.idUsuario, identidad.idUsuario)
      : eq(sesiones.ci, (identidad.ci ?? "").trim().toUpperCase());

    const resultado = await db
      .update(sesiones)
      .set({ revocadaEn: new Date(), motivoRevocacion: motivo.slice(0, 120) })
      .where(
        and(
          condicion,
          isNull(sesiones.revocadaEn),
          sql`${sesiones.tokenHash} <> ${hashDeToken(tokenActual)}`
        )
      );
    return (resultado as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.error("[sesiones] no se pudieron revocar las otras sesiones:", e);
    return 0;
  }
}

/** Cierra todas las sesiones de un titular. Se usa al dar de baja su registro. */
export async function revocarSesionesDePersona(idPersona: number, motivo: string): Promise<number> {
  try {
    const resultado = await db
      .update(sesiones)
      .set({ revocadaEn: new Date(), motivoRevocacion: motivo.slice(0, 120) })
      .where(and(eq(sesiones.idPersona, idPersona), isNull(sesiones.revocadaEn)));
    return (resultado as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.error("[sesiones] no se pudieron revocar las sesiones de la persona:", e);
    return 0;
  }
}

/**
 * Limpieza periódica: descarta filas vencidas hace más de 30 días para que la tabla no
 * crezca sin límite. No es crítico, así que se llama desde la ruta de sesión y desde un
 * script, nunca bloqueando una petición.
 */
export async function limpiarSesionesVencidas(): Promise<number> {
  try {
    const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * MS_POR_SEGUNDO);
    const resultado = await db
      .delete(sesiones)
      .where(or(lt(sesiones.expiraEn, limite), lt(sesiones.revocadaEn, limite)));
    return (resultado as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.error("[sesiones] no se pudo limpiar:", e);
    return 0;
  }
}

/** Extrae el valor crudo de la cookie de sesión, si está. */
export function tokenDeRequest(req: NextRequest): string | null {
  return req.cookies.get(NOMBRE_COOKIE)?.value ?? null;
}

/** Cuántas sesiones abiertas tiene ahora mismo una identidad. Para el panel de auditoría. */
export async function contarSesionesActivas(identidad: {
  idUsuario?: number | null;
  ci?: string | null;
}): Promise<number> {
  try {
    const filas = await db
      .select({ id: sesiones.id })
      .from(sesiones)
      .where(
        and(
          identidad.idUsuario
            ? eq(sesiones.idUsuario, identidad.idUsuario)
            : eq(sesiones.ci, (identidad.ci ?? "").trim().toUpperCase()),
          isNull(sesiones.revocadaEn),
          gt(sesiones.expiraEn, new Date())
        )
      );
    return filas.length;
  } catch {
    return 0;
  }
}