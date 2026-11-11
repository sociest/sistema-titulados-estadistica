import { NextRequest } from "next/server";

/**
 * Sesión firmada por cookie.
 *
 * La cookie NO guarda el JSON en claro: guarda un token firmado con HMAC-SHA256
 * usando `SESSION_SECRET`. Si alguien edita la cookie a mano, la firma deja de
 * cuadrar y `verificarToken` devuelve `null`.
 *
 * IMPORTANTE — por qué Web Crypto y no `require("crypto")`: este módulo también
 * corre en `src/middleware.ts`, que usa el runtime Edge. Allí `require`, `Buffer`
 * y `process` no existen, y el HMAC tiene que pedirse con `crypto.subtle`, que sí
 * está disponible en ambos runtimes. Ojo también con el `await`: si se olvida,
 * se obtiene una Promise (que es "truthy") y las guardas de `lib/guards.ts`
 * dejan de proteger nada.
 */

/** Duración de la sesión: 30 minutos desde que se emite el token. */
export const DURACION_SESION_MS = 30 * 60 * 1000;

export const NOMBRE_COOKIE = "seguit_sesion";

/** Datos que viajan dentro del token. `sub` es el id del registro o del usuario. */
export type DatosToken = {
  sub: number;
  rol: string;
  ci: string;
  nombre?: string | null;
  correo?: string | null;
};

/**
 * Lo que devuelve `leerSesionDeRequest`, ya con la marca de actividad para las
 * guardas que necesitan medir inactividad.
 */
export type Sesion = DatosToken & { ultimaActividad: number };

/** Vida de la cookie. El corte real de sesión lo impone el token (30 min). */
export const VIDA_COOKIE_SEGUNDOS = 8 * 60 * 60;

export function opcionesCookie(maxAge: number = VIDA_COOKIE_SEGUNDOS) {
  return {
    name: NOMBRE_COOKIE,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax" as const,
    maxAge,
    httpOnly: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64URL (sin Buffer: no existe en el runtime Edge)
// ─────────────────────────────────────────────────────────────────────────────

function aBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `crypto.subtle` es global en el runtime Edge y en el de Next, pero el runner
 * de pruebas de Node 18 lo deja sin exponer en `globalThis`. Por eso se resuelve
 * con un respaldo, en vez de escribir `crypto.subtle` directo, que falla con
 * "crypto is not defined".
 *
 * El respaldo se evaluationa solo si falta el global, así que en Edge —donde
 * `require` no existe— nunca se intenta.
 */
let cryptoResuelto: Crypto | null = null;

async function webCrypto(): Promise<Crypto> {
  if (cryptoResuelto) return cryptoResuelto;

  const global = globalThis as { crypto?: Crypto };
  if (global.crypto?.subtle) {
    cryptoResuelto = global.crypto;
    return cryptoResuelto;
  }

  // Node sin global crypto (p. ej. el runner de pruebas). Se importa en diferido
  // y con `webpackIgnore` para que webpack no intente meter `node:crypto` en el
  // bundle de Edge, donde este camino no se ejecuta nunca.
  const especificador = "node:" + "crypto";
  const modulo = (await import(/* webpackIgnore: true */ especificador)) as {
    webcrypto: Crypto;
  };
  cryptoResuelto = modulo.webcrypto;
  return cryptoResuelto;
}

async function claveSecreto(): Promise<CryptoKey> {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error("SESSION_SECRET es obligatorio");
  return (await webCrypto()).subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function firmar(cuerpo: string): Promise<string> {
  const clave = await claveSecreto();
  const firma = await (await webCrypto()).subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo));
  return aBase64Url(new Uint8Array(firma));
}

// ─────────────────────────────────────────────────────────────────────────────
// Token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emite un token firmado. `emitidoEn` solo existe para poder probar la
 * expiración sin esperar 30 minutos en las pruebas.
 *
 * El cuerpo incluye `nonce`: 16 bytes aleatorios del generador criptográfico.
 *
 * Por qué hace falta si la firma HMAC ya impide que alguien fabrique un token:
 * sin `nonce`, el token es DERIVABLE de datos que el atacante ya conoce (rol, CI) más
 * una marca de tiempo en milisegundos. Eso lo convierte en un identificador
 * predecible, que es justo lo que OWASP Session Management pide evitar: permite
 * pre-calcular tokens válidos y adivinar el de otra persona. El `nonce` no protege
 * nada por sí solo, pero hace que dos inicios de sesión del mismo usuario en el mismo
 * milisegundo produzcan tokens distintos e imposibles de anticipar.
 */
export async function crearToken(datos: DatosToken, emitidoEn: number = Date.now()): Promise<string> {
  const cuerpo = JSON.stringify({ ...datos, emitidoEn, nonce: await nonceAleatorio() });
  return `${aBase64Url(new TextEncoder().encode(cuerpo))}.${await firmar(cuerpo)}`;
}

/** 16 bytes (128 bits) del CSPRNG, en base64url. */
async function nonceAleatorio(): Promise<string> {
  const bytes = new Uint8Array(16);
  await (await webCrypto()).getRandomValues(bytes);
  return aBase64Url(bytes);
}

/**
 * Verifica firma y expiración. Devuelve `null` ante cualquier problema: cookie
 * ausente, token adulterado, corrupto o vencido. Nunca lanza, para que una
 * cookie inválida solo provoque un 401 y no un 500.
 */
export async function verificarToken(
  token: string | undefined | null,
  ahora: number = Date.now()
): Promise<DatosToken | null> {
  if (!token || !process.env.SESSION_SECRET) return null;

  try {
    const partes = token.split(".");
    if (partes.length !== 2) return null;

    const [cuerpoB64, firma] = partes as [string, string];
    const cuerpo = new TextDecoder().decode(deBase64Url(cuerpoB64));

    // Comparación de firma en tiempo constante para no filtrar información por
    // el tiempo de respuesta.
    const esperada = await firmar(cuerpo);
    if (firma.length !== esperada.length) return null;
    let diferencia = 0;
    for (let i = 0; i < firma.length; i++) diferencia |= firma.charCodeAt(i) ^ esperada.charCodeAt(i);
    if (diferencia !== 0) return null;

    const payload = JSON.parse(cuerpo) as DatosToken & { emitidoEn?: number };
    if (typeof payload !== "object" || payload === null) return null;

    const emitidoEn = Number(payload.emitidoEn);
    if (!Number.isFinite(emitidoEn)) return null;
    if (ahora - emitidoEn > DURACION_SESION_MS) return null;

    const { emitidoEn: _omitido, ...datos } = payload;
    return datos;
  } catch {
    return null;
  }
}

/**
 * Lee la sesión desde el request. Es la puerta de entrada de las guardas: si el
 * token no es válido devuelve `null` y quien llama responde 401.
 */
export async function leerSesionDeRequest(req: NextRequest): Promise<Sesion | null> {
  const cookie = req.cookies.get(NOMBRE_COOKIE);
  if (!cookie) return null;

  const datos = await verificarToken(cookie.value);
  if (!datos) return null;

  return { ...datos, ultimaActividad: Date.now() };
}