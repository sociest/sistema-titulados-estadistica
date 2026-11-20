import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { verificaciones } from "@/db/schema";

/**
 * Verificación de correo para el alta pública (decisión D5, opción B).
 *
 * El enlace lleva un token aleatorio de 32 bytes. En la base de datos solo se guarda su
 * SHA-256, de modo que leer la tabla no permite completar el registro de otra persona, y
 * el token tiene fecha de expiración y se marca como usado al consumirlo.
 */

const VIGENCIA_HORAS = 48;
const MAX_INTENTOS = 5;

export function hashDeTokenVerificacion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Devuelve el token EN CLARO, que es lo único que irá en el enlace. */
export function nuevoTokenVerificacion(): string {
  return randomBytes(32).toString("hex");
}

export async function crearVerificacion(params: {
  idPersona: number;
  destino: string;
  proposito?: string;
}): Promise<string> {
  const token = nuevoTokenVerificacion();

  await db.insert(verificaciones).values({
    idPersona: params.idPersona,
    proposito: params.proposito ?? "REGISTRO",
    tokenHash: hashDeTokenVerificacion(token),
    destino: params.destino,
    expiraEn: new Date(Date.now() + VIGENCIA_HORAS * 60 * 60 * 1000),
  });

  return token;
}

export type ResultadoVerificacion =
  | { ok: true; idPersona: number }
  | { ok: false; motivo: "invalido" | "expirado" | "usado" | "demasiados_intentos" };

/**
 * Valida el token y marca la fila como usada. `soloConsultar` no gasta el enlace: sirve
 * para decidir si hay que pedir otro.
 */
export async function validarToken(
  token: string,
  soloConsultar = false,
  proposito = "REGISTRO"
): Promise<ResultadoVerificacion> {
  const hash = hashDeTokenVerificacion(token);
  const filas = await db
    .select()
    .from(verificaciones)
    .where(and(eq(verificaciones.tokenHash, hash), eq(verificaciones.proposito, proposito)))
    .limit(1);

  const fila = filas[0];
  if (!fila) return { ok: false, motivo: "invalido" };
  if (fila.usadaEn) return { ok: false, motivo: "usado" };
  if (fila.intentos >= MAX_INTENTOS) return { ok: false, motivo: "demasiados_intentos" };
  if (new Date(fila.expiraEn).getTime() < Date.now()) return { ok: false, motivo: "expirado" };

  if (soloConsultar) return { ok: true, idPersona: fila.idPersona };

  const ahora = new Date();
  const consumidas = await db
    .update(verificaciones)
    .set({ usadaEn: ahora, intentos: sql`${verificaciones.intentos} + 1` })
    .where(
      and(
        eq(verificaciones.id, fila.id),
        eq(verificaciones.proposito, proposito),
        isNull(verificaciones.usadaEn),
        gt(verificaciones.expiraEn, ahora),
        sql`${verificaciones.intentos} < ${MAX_INTENTOS}`
      )
    )
    .returning({ idPersona: verificaciones.idPersona });

  if (!consumidas[0]) return { ok: false, motivo: "usado" };

  return { ok: true, idPersona: consumidas[0].idPersona };
}

/** Registra un intento fallido, para no dejar el enlace atacable indefinidamente. */
export async function sumarIntento(token: string): Promise<void> {
  try {
    await db
      .update(verificaciones)
      .set({ intentos: sql`${verificaciones.intentos} + 1` })
      .where(eq(verificaciones.tokenHash, hashDeTokenVerificacion(token)));
  } catch (e) {
    console.error("[verificacion] no se pudo sumar el intento:", e);
  }
}