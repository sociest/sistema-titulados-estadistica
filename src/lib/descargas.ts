import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * URLs firmadas con expiración corta (ISO/IEC 27001:2022, A.8.12 "Data leakage
 * prevention" — en la edición 2013 el requisito equivalente era A.8.12 "Prevención de
 * fuga de datos"; la aplicación en 2022 sigue ficheros bajo el mismo objetivo).
 *
 * EL PROBLEMA QUE RESUELVE: una descarga protegida por cookie no está protegida. El
 * enlace `/api/exportar?formato=csv` es un GET, así que puede acabar en el historial del
 * navegador, en un proxy, en un log del servidor o en el `Referer` de la página que lo
 * enlaza — y quien lo lea descarga la base de datos completa sin tener ninguna sesión.
 *
 * La firma ata la descarga a tres cosas: un token de sesión concreto, una ventana de
 * tiempo muy corta y un alcance concreto (el formato y los filtros exactos). Alterar
 * cualquiera de las tres invalida el enlace.
 *
 * DISEÑO: firma HMAC-SHA256 calculada sobre `ruta + expiración + usuario`, no sobre el
 * contenido de la petición. Los filtros NO entran en la firma porque se envían en la
 * propia URL firmada y, por tanto, ya quedan cubiertos de forma implícita: modificar un
 * filtro cambia la URL y con ella la firma.
 */

/** Ventana por defecto: 5 minutos. Suficiente para descargar, demasiado corto para reutilizar. */
export const VIGENCIA_DESCARGA_MS = 5 * 60 * 1000;

/**
 * Clave de firma. Reutiliza `SESSION_SECRET` a propósito: un único secreto que hay que
 * proteger es mejor que dos que se gestionan por separado. Si se separaran, habría que
 * garantizar que ambos roten juntos, y ese es un fallo frecuente.
 */
function clave(): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error("SESSION_SECRET es obligatorio para firmar descargas");
  return secreto;
}

export interface FirmaDescarga {
  /** Marca de expiración, en milisegundos epoch. */
  exp: number;
  /** Sujeto de la firma: el identificador de quien puede usarla. */
  sub: string;
}

function aBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function deBase64Url(texto: string): Buffer {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normal, "base64");
}

/** Calcula la firma de una descarga. */
function calcular(ruta: string, exp: number, sub: string): string {
  return aBase64Url(
    createHmac("sha256", clave()).update(`${ruta} ${exp} ${sub}`, "utf8").digest()
  );
}

/**
 * Emite un enlace de descarga temporal: `/api/exportar?sig=...&exp=...&sub=...`.
 *
 * `sub` va en URL porque el cliente tiene que poder distinguir una firma propia de la de
 * otro usuario, pero NO es secreto: está atado al hash, así que cambiarlo rompe la firma.
 */
export function firmarDescarga(ruta: string, sub: string, msValidez: number = VIGENCIA_DESCARGA_MS): {
  url: string;
  exp: number;
} {
  const exp = Date.now() + msValidez;
  const sig = calcular(ruta, exp, sub);
  return { url: `${ruta}?sig=${encodeURIComponent(sig)}&exp=${exp}&sub=${encodeURIComponent(sub)}`, exp };
}

export type ResultadoVerificacionFirma =
  | { valida: true; exp: number }
  | { valida: false; motivo: "ausente" | "malformada" | "expirada" | "alterada" | "otro-sujeto" };

/**
 * Verifica la firma de una petición de descarga.
 *
 * `otro-sujeto` se distingue de `alterada` a propósito: si el enlace se comparte entre
 * administradores, hay que poder decir en la auditoría que fue un enlace ajeno y no una
 * firma manipulada. Son incidentes distintos.
 */
export function verificarDescarga(
  ruta: string,
  sig: string | null,
  exp: number | null,
  sub: string | null,
  subEsperado: string,
  ahora: number = Date.now()
): ResultadoVerificacionFirma {
  if (!sig || !exp || !sub) return { valida: false, motivo: "ausente" };
  if (!Number.isFinite(exp)) return { valida: false, motivo: "malformada" };

  const esperada = calcular(ruta, exp, sub);
  const recibido = deBase64Url(sig);

  // OJO: la comparación de longitudes es ENTRE BUFFERS. Una firma base64url de 32 bytes
  // mide 43 caracteres como cadena, y comparar `recibido.length` (32, bytes) contra
  // `esperada.length` (43, caracteres de la cadena) da siempre falso, con lo que
  // TODAS las descargas se rechazaban como "alteradas". Se decodifica la esperada
  // también y se comparan los bytes.
  const esperadaBuf = deBase64Url(esperada);
  const correcto =
    recibido.length === esperadaBuf.length && timingSafeEqual(recibido, esperadaBuf);

  if (!correcto) return { valida: false, motivo: "alterada" };
  if (sub !== subEsperado) return { valida: false, motivo: "otro-sujeto" };
  if (ahora > exp) return { valida: false, motivo: "expirada" };

  return { valida: true, exp };
}