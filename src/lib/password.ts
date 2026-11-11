import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * MÓDULO SOLO DE SERVIDOR: las contraseñas solo se hashean y verifican en el servidor.
 *
 * Importa `crypto` sin el prefijo `node:` porque webpack (el empaquetador de Next) no
 * reconoce el esquema `node:` y el build falla con `UnhandledSchemeError`.
 *

/**
 * Hashing de contraseñas con scrypt (KDF de Node, sin dependencias nativas).
 *
 * Por qué scrypt y no bcrypt/argon2:
 *  - No requiere compilación nativa (`node-gyp`), que en Windows + pnpm suele fallar.
 *  - Es memory-hard y está en la lista de recomendaciones de OWASP.
 *  - Viene incluido en Node, cero dependencias que instalar.
 *
 * Formato almacenado en `usuarios.password_hash`:
 *   scrypt$N$r$p$<saltBase64>$<hashBase64>
 *
 * Si se migra a bcrypt o argon2 más adelante, este archivo es el único punto a cambiar,
 * junto con el verificador correspondiente.
 */

const N = 16384; // costo de CPU/memoria (2^14)
const r = 8; // tamaño de bloque
const p = 1; // factor de paralelización
const KEYLEN = 64;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const partes = stored.split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return false;

    const n = Number(partes[1]);
    const rr = Number(partes[2]);
    const pp = Number(partes[3]);
    const salt = Buffer.from(partes[4], "base64");
    const esperado = Buffer.from(partes[5], "base64");

    if (!Number.isFinite(n) || !Number.isFinite(rr) || !Number.isFinite(pp)) return false;
    if (esperado.length === 0) return false;

    const calculado = scryptSync(password, salt, esperado.length, { N: n, r: rr, p: pp });

    // timingSafeEqual exige mismo largo; ya está garantizado arriba.
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/** Normaliza una CI a su forma numérica para compararla sin depender del formato. */
export function normalizarCi(ci: string): string {
  return (ci ?? "").replace(/[^0-9]/g, "");
}