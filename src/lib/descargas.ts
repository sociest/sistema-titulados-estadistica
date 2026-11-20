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

const PARAMETROS_FIRMA = new Set(["sig", "exp", "sub"]);

function queryCanonica(params?: URLSearchParams | null): string {
  if (!params) return "";
  const pares: Array<[string, string]> = [];
  params.forEach((valor, clave) => {
    if (!PARAMETROS_FIRMA.has(clave)) {
      pares.push([clave, valor]);
    }
  });
  if (pares.length === 0) return "";
  pares.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const limpio = new URLSearchParams();
  for (const [k, v] of pares) limpio.append(k, v);
  return limpio.toString();
}

/** Calcula la firma de una descarga cubriendo ruta + filtros canónicos + expiración + sujeto. */
function calcular(ruta: string, exp: number, sub: string, params?: URLSearchParams | null): string {
  const qs = queryCanonica(params);
  const alcance = qs ? `${ruta}?${qs}` : ruta;
  return aBase64Url(
    createHmac("sha256", clave()).update(`descarga:v1:${alcance} ${exp} ${sub}`, "utf8").digest()
  );
}

/**
 * Emite un enlace de descarga temporal: `/api/exportar?sig=...&exp=...&sub=...`.
 *
 * `params` se incorpora a la firma HMAC para impedir que quien obtenga un enlace
 * modifique `?tipo=`, `?formato=`, `?incluirBajas=true`, etc.
 */
export function firmarDescarga(
  ruta: string,
  sub: string,
  msValidez: number = VIGENCIA_DESCARGA_MS,
  params?: URLSearchParams | null
): {
  url: string;
  exp: number;
} {
  const exp = Date.now() + msValidez;
  const sig = calcular(ruta, exp, sub, params);
  const base = `${ruta}?sig=${encodeURIComponent(sig)}&exp=${exp}&sub=${encodeURIComponent(sub)}`;
  const extra = params && params.size ? `&${params.toString()}` : "";
  return { url: `${base}${extra}`, exp };
}

export type ResultadoVerificacionFirma =
  | { valida: true; exp: number }
  | { valida: false; motivo: "ausente" | "malformada" | "expirada" | "alterada" | "otro-sujeto" };

/**
 * Verifica la firma de una petición de descarga (incluidos sus filtros en `params`).
 */
export function verificarDescarga(
  ruta: string,
  sig: string | null,
  exp: number | null,
  sub: string | null,
  subEsperado: string,
  params?: URLSearchParams | null,
  ahora: number = Date.now()
): ResultadoVerificacionFirma {
  if (!sig || !exp || !sub) return { valida: false, motivo: "ausente" };
  if (!Number.isFinite(exp)) return { valida: false, motivo: "malformada" };

  const esperada = calcular(ruta, exp, sub, params);
  const recibido = deBase64Url(sig);

  const esperadaBuf = deBase64Url(esperada);
  const correcto =
    recibido.length === esperadaBuf.length && timingSafeEqual(recibido, esperadaBuf);

  if (!correcto) return { valida: false, motivo: "alterada" };
  if (sub !== subEsperado) return { valida: false, motivo: "otro-sujeto" };
  if (ahora > exp) return { valida: false, motivo: "expirada" };

  return { valida: true, exp };
}