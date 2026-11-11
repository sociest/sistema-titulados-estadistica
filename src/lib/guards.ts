import { NextResponse } from "next/server";
import { leerSesionDeRequest, type Sesion } from "./sesion";
import { NOMBRE_COOKIE } from "./sesion";
import type { NextRequest } from "next/server";

/**
 * Guardas de autorización para los API Routes.
 *
 * ANTES de este cambio, `/api/exportar` y `/api/dashboard` respondían a CUALQUIER
 * petición, incluso sin sesión: la protección era solo visual en el cliente
 * (`user.rol !== "admin"` en un `useEffect`), que se salta con un `fetch` directo.
 *
 * Reglas:
 *  - `/api/exportar`          → solo admin (descarga la base de datos completa).
 *  - `/api/dashboard`         → solo admin con ?scope=admin o con filtros; público sin parámetros.
 *  - `/api/personas`          → escritura y listado: admin. Autogestión por cookie.
 *  - `/api/noticias` (escrita)→ solo admin.
 *  - `/api/usuarios`, `/api/auditoria` → solo admin.
 *
 * SON ASÍNCRONAS a propósito: `verificarToken` firma con Web Crypto (`crypto.subtle`), que es
 * lo único disponible en el runtime Edge donde corre `src/middleware.ts`. Si se olvida el
 * `await` se obtiene una Promise —que es "truthy"— y `sesion.rol` queda `undefined`, lo que
 * provoca un 403 en todas partes. Ese fue el bug que dejó el login sin funcionar.
 */

export async function exigirAdmin(
  req: Parameters<typeof leerSesionDeRequest>[0]
): Promise<NextResponse | null> {
  const sesion = await leerSesionVigente(req);
  if (!sesion) {
    await registrarAccesoDenegado(req, "sin sesión válida");
    return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  }
  if (sesion.rol !== "admin") {
    await registrarAccesoDenegado(
      req,
      `rol ${sesion.rol} intentó usar un recurso de administrador`,
      sesion.sub
    );
    return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
  }
  return null;
}

export async function exigirKardex(
  req: Parameters<typeof leerSesionDeRequest>[0]
): Promise<NextResponse | null> {
  const sesion = await leerSesionVigente(req);
  if (!sesion) {
    await registrarAccesoDenegado(req, "sin sesión válida para Kardex");
    return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  }
  if (sesion.rol !== "KARDEX") {
    const idUsuario = sesion.rol === "admin" ? sesion.sub : null;
    await registrarAccesoDenegado(req, `rol ${sesion.rol} intentó usar el visor Kardex`, idUsuario);
    return NextResponse.json({ error: "Requiere permisos de Kardex" }, { status: 403 });
  }
  return null;
}

/**
 * Segunda capa de la revocación (decisión D2).
 *
 * `leerSesionDeRequest` solo comprueba la firma del token. Cuando la sesión se revoca
 * —logout desde otro dispositivo, cambio de contraseña— el token sigue siendo
 * criptográficamente válido hasta que expira, así que aquí se consulta la fila de
 * `sesiones` antes de dar por buena la sesión. La consulta es por el SHA-256 del token
 * (columna indexada y única), no por un escaneo de la tabla.
 */
export async function leerSesionVigente(
  req: Parameters<typeof leerSesionDeRequest>[0]
): Promise<Sesion | null> {
  const sesion = await leerSesionDeRequest(req);
  if (!sesion) return null;

  const token = req.cookies.get(NOMBRE_COOKIE)?.value;
  if (!token) return null;

  const { sesionEstaVigente } = await import("./sesiones");
  if (await sesionEstaVigente(token)) return sesion;

  return null;
}

/** Admin, o bien el propio titular de la persona indicada por `ci`. */
export async function exigirAdminOContacto(
  req: Parameters<typeof leerSesionDeRequest>[0],
  ciSolicitada: string
): Promise<NextResponse | null> {
  const sesion = await leerSesionVigente(req);
  if (!sesion) {
    await registrarAccesoDenegado(req, "sin sesión válida");
    return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  }
  if (sesion.rol === "admin") return null;

  const normalizar = (s: string) => (s ?? "").trim().toUpperCase();
  if (normalizar(sesion.ci) && normalizar(sesion.ci) === normalizar(ciSolicitada)) return null;

  await registrarAccesoDenegado(
    req,
    `intento de acceso al registro de otra persona (CI pedida: ${ciSolicitada})`,
    sesion.sub
  );
  return NextResponse.json({ error: "No tiene permisos sobre este registro" }, { status: 403 });
}

/**
 * Los intentos de acceso denegado (401/403) también quedan en `audit_log`, para poder
 * detectar alguien que anda probando el sistema. Nunca lanza: si el log falla, el 401/403
 * se devuelve igual.
 */
async function registrarAccesoDenegado(
  req: Parameters<typeof leerSesionDeRequest>[0],
  motivo: string,
  idUsuario?: number | null
): Promise<void> {
  const { registrarAuditoria } = await import("@/lib/auditoria");
  await registrarAuditoria({
    accion: "editar",
    entidad: "acceso_denegado",
    idUsuario: idUsuario ?? null,
    detalles: `Acceso denegado a ${req.nextUrl.pathname}: ${motivo}`,
    req: req as never,
  });
}

/**
 * Protección CSRF ligera para rutas de escritura sensibles.
 *
 * Verifica que el header `Origin` o `Referer` coincida con el host de la aplicación
 * (`NEXT_PUBLIC_APP_URL`). No es un token CSRF doble, pero con `sameSite: lax` en las
 * cookies de sesión y esta comprobación de origen, un sitio tercero no puede forjar
 * una petición autenticada contra `/api/exportar`, `/api/importar`, `/api/usuarios`,
 * etc. porque el navegador no envía `Origin` en peticiones de origen cruzado y
 * `Referer` puede omitirse pero `Origin` sí se envía en peticiones POST/PUT/DELETE con
 * credenciales.
 *
 * La comprobación usa el header `Host` de la petición (que el navegador fija al
 * servidor destino y un sitio tercero no puede falsificar) además de
 * `NEXT_PUBLIC_APP_URL`, de modo que funciona también detrás de un proxy que
 * reescribe el host. No se desactiva por `NODE_ENV`: las peticiones legítimas de
 * navegador siempre envían `Origin` o `Referer`.
 *
 * Escape hatch: `CSRF_DISABLED=1` (solo para herramientas internas sin navegador).
 */
export async function verificarCsrf(req: NextRequest): Promise<NextResponse | null> {
  if (process.env.CSRF_DISABLED === "1") return null;

  const origen = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origen) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  try {
    const url = new URL(origen);
    const permitidos = new Set<string>();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      try {
        permitidos.add(new URL(appUrl).host);
      } catch {
        // NEXT_PUBLIC_APP_URL inválida: se ignora y se usa el Host real.
      }
    }

    const hostCabecera = (
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
    )
      .split(",")[0]!
      .trim();
    if (hostCabecera) permitidos.add(hostCabecera);

    if (!permitidos.has(url.host)) {
      return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Origen inválido" }, { status: 403 });
  }

  return null;
}

/** Respuesta uniforme de error interno, sin filtrar detalles de la base de datos. */
export function errorInterno(e: unknown, contexto: string): NextResponse {
  // El detalle real solo al log del servidor, nunca al cliente.
  console.error(`[${contexto}]`, e);
  return NextResponse.json(
    { error: "Ocurrió un error en el servidor. Intente nuevamente." },
    { status: 500 }
  );
}