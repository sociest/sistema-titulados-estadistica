import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "crypto";

/**
 * MÓDULO SOLO DE SERVIDOR: las contraseñas solo se hashean y verifican en el servidor.
 *
 * Importa `crypto` sin el prefijo `node:` porque webpack (el empaquetador de Next) no
 * reconoce el esquema `node:` y el build falla con `UnhandledSchemeError`.
 */

const N = 16384; // costo de CPU/memoria (2^14)
const r = 8; // tamaño de bloque
const p = 1; // factor de paralelización
const KEYLEN = 64;
const SALT_BYTES = 16;
const MAX_PASSWORD_LEN = 256;
const MAX_SCRYPT_N = 65536;
const MAX_MEM_BYTES = 64 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function parsearHashAlmacenado(stored: string) {
  const partes = stored.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return null;

  const n = Number(partes[1]);
  const rr = Number(partes[2]);
  const pp = Number(partes[3]);
  const salt = Buffer.from(partes[4]!, "base64");
  const esperado = Buffer.from(partes[5]!, "base64");

  if (!Number.isInteger(n) || n < 1024 || n > MAX_SCRYPT_N || (n & (n - 1)) !== 0) return null;
  if (!Number.isInteger(rr) || rr < 1 || rr > 16) return null;
  if (!Number.isInteger(pp) || pp < 1 || pp > 4) return null;
  if (salt.length < 8 || esperado.length === 0 || esperado.length > 128) return null;

  return { n, rr, pp, salt, esperado };
}

export function hashPassword(password: string): string {
  const recortada = password.slice(0, MAX_PASSWORD_LEN);
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(recortada, salt, KEYLEN, { N, r, p, maxmem: MAX_MEM_BYTES });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function hashPasswordAsync(password: string): Promise<string> {
  const recortada = password.slice(0, MAX_PASSWORD_LEN);
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(recortada, salt, KEYLEN, { N, r, p, maxmem: MAX_MEM_BYTES });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (typeof password !== "string" || password.length > MAX_PASSWORD_LEN) return false;
    const params = parsearHashAlmacenado(stored);
    if (!params) return false;

    const calculado = scryptSync(password, params.salt, params.esperado.length, {
      N: params.n,
      r: params.rr,
      p: params.pp,
      maxmem: MAX_MEM_BYTES,
    });
    return timingSafeEqual(calculado, params.esperado);
  } catch {
    return false;
  }
}

export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  try {
    if (typeof password !== "string" || password.length > MAX_PASSWORD_LEN) return false;
    const params = parsearHashAlmacenado(stored);
    if (!params) return false;

    const calculado = await scryptAsync(password, params.salt, params.esperado.length, {
      N: params.n,
      r: params.rr,
      p: params.pp,
      maxmem: MAX_MEM_BYTES,
    });
    return timingSafeEqual(calculado, params.esperado);
  } catch {
    return false;
  }
}

/** Hash señuelo para igualar tiempos de respuesta cuando el identificador no existe. */
export const HASH_SENUELO = hashPassword("senuelo-anti-enumeracion-seguit");

/** Normaliza una CI a su forma numérica para compararla sin depender del formato. */
export function normalizarCi(ci: string): string {
  return (ci ?? "").replace(/[^0-9]/g, "");
}