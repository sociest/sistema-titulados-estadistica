import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_ACTIVIDAD,
  INACTIVIDAD_MS,
  NOMBRE_COOKIE,
  VIDA_COOKIE_SEGUNDOS,
  esCookieSegura,
  leerSesionDeRequest,
} from "@/lib/sesion";

/**
 * Protección de rutas en el SERVIDOR (decisión D4, aprobada: defensa en profundidad).
 *
 * Antes, `/admin/dashboard` solo ocultaba contenido con un `useEffect` en el cliente,
 * con el `router.push("/login")` comentado. Eso no protege nada: la página se seguía
 * descargando y la API respondía igual.
 *
 * Ahora hay DOS capas, y ninguna de las dos es suficiente por sí sola:
 *   1. Esta: lista centralizada de prefijos protegidos, resuelta antes de renderizar.
 *   2. Los guards (`exigirAdmin` en cada route handler), que además son los únicos que
 *      pueden consultar la revocación en la tabla `sesiones`.
 *
 * El middleware corre en el runtime EDGE: no tiene base de datos ni `require("crypto")`.
 * Por eso aquí solo se valida la FIRMA del token; la revocación real se comprueba en
 * `lib/guards.ts`, que sí corre en Node.
 */

const ROLES = ["admin", "TITULADO", "EGRESADO", "KARDEX"] as const;
type Rol = (typeof ROLES)[number];

const esRol = (valor: string): valor is Rol => (ROLES as readonly string[]).includes(valor);

const RUTAS_POR_ROL: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/admin/personas", roles: ["admin", "KARDEX"] },
  { prefijo: "/admin/importar", roles: ["admin", "KARDEX"] },
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/portal/titulado", roles: ["TITULADO", "admin"] },
  { prefijo: "/portal/egresado", roles: ["EGRESADO", "admin"] },
  { prefijo: "/kardex", roles: ["KARDEX", "admin"] },
];

const APIS_SOLO_ADMIN = [
  "/api/usuarios",
  "/api/exportar",
  "/api/auditoria",
  "/api/respaldar",
  "/api/registros",
  "/api/correo/probar",
];

const APIS_ADMIN_O_KARDEX = ["/api/personas", "/api/importar", "/api/noticias/imagen"];
const APIS_SOLO_KARDEX = ["/api/kardex"];
const APIS_REQUIEREN_SESION = ["/api/carreras", "/api/solicitudes", "/api/correo/cambiar/saltar"];

/**
 * Excepción a `/api/personas` para el portal de titulados y egresados.
 *
 * Esa ruta tiene dos comportamientos distintos según venga o no `?ci=`:
 *   - sin `?ci=`  → listado, solo admin
 *   - con `?ci=`  → ficha puntual, admin o el propio titular
 *
 * Los formularios del portal leen y guardan su propia ficha con `?ci=<su CI>`. Antes esta
 * ruta estaba en `APIS_SOLO_ADMIN` entera, así que el middleware rechazaba a todo
 * no-admin con 403 ANTES de que la ruta llegara a su propio guard, y el portal no podía
 * cargar ni guardar nada.
 *
 * Acá solo se abre la compuerta cuando la CI pedida es la misma que trae la sesión. El
 * listado sin `?ci=` sigue bloqueado, y la ruta vuelve a verificar con
 * `exigirAdminOContacto`, así que esta capa no reemplaza al guard: es una red más.
 */
function esApiPersonasDePropioTitular(ruta: string, req: NextRequest, sesion: { ci?: string } | null) {
  if (ruta !== "/api/personas") return false;

  const ciPedida = req.nextUrl.searchParams.get("ci");
  if (!ciPedida) return false;

  const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
  return norm(sesion?.ci) !== "" && norm(sesion?.ci) === norm(ciPedida);
}

/** APIs accesibles por cualquier usuario con sesión (admin o titular). */
/**
 * APIs accesibles por cualquier usuario con sesión (admin o titular).
 *
 * `/api/mis-datos` va aquí porque implementa los derechos de acceso, portabilidad y
 * supresión: tienen que poder ejercerlos los TITULARES, no solo el administrador. La
 * ruta se autoexige además (`exigirAdmin` más la comparación de CI en
 * `lib/guards.ts`), porque "con sesión" no debe significar "sobre cualquier ficha".
 */
const APIS_CON_SESION = ["/api/noticias", "/api/mis-datos"];

export async function middleware(req: NextRequest) {
  // Defensa en profundidad frente a intentos de suplantación de subpeticiones de middleware (CVE-2025-29927).
  if (req.headers.has("x-middleware-subrequest")) {
    return NextResponse.json({ error: "Cabecera no permitida" }, { status: 403 });
  }

  const ruta = req.nextUrl.pathname;
  const esApi = ruta.startsWith("/api/");

  const regla = RUTAS_POR_ROL.find((r) => ruta === r.prefijo || ruta.startsWith(`${r.prefijo}/`));
  const esEscrituraNoticias =
    ((ruta === "/api/noticias" || ruta.startsWith("/api/noticias/")) &&
      !ruta.startsWith("/api/noticias/imagen") &&
      req.method !== "GET");
  const soloAdmin =
    esEscrituraNoticias || APIS_SOLO_ADMIN.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const adminOKardex = APIS_ADMIN_O_KARDEX.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const soloKardex = APIS_SOLO_KARDEX.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const requiereSesion = APIS_REQUIEREN_SESION.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const conSesion = APIS_CON_SESION.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  const soloLecturaPublica = (p: string) => ruta === p || ruta.startsWith(`${p}/`);
  const lecturaPublica =
    soloLecturaPublica("/api/noticias") &&
    req.method === "GET" &&
    req.nextUrl.searchParams.get("admin") !== "1";

  if (!regla && !soloAdmin && !adminOKardex && !soloKardex && !requiereSesion && (!conSesion || lecturaPublica)) return NextResponse.next();

  const token = req.cookies.get(NOMBRE_COOKIE)?.value;
  const sesion = await leerSesionDeRequest(req);

  // Sin token, o con token vencido o manipulado.
  if (!token || !sesion) {
    if (esApi) {
      return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
    }
    return redirigir(req, ruta);
  }

  // ── Inactividad ──────────────────────────────────────────────────────────────
  // En Edge validamos la cookie de actividad (incluyendo rechazo de valores corruptos o
  // futuros); en Node `sesionEstaVigente` impone además `sesiones.ultima_actividad_en`.
  const valorActividad = req.cookies.get(COOKIE_ACTIVIDAD)?.value;
  if (valorActividad !== undefined) {
    const actividadPrevia = Number(valorActividad);
    const ahora = Date.now();
    if (
      !Number.isFinite(actividadPrevia) ||
      actividadPrevia <= 0 ||
      actividadPrevia > ahora + 60_000 ||
      ahora - actividadPrevia > INACTIVIDAD_MS
    ) {
      const respuesta = esApi
        ? NextResponse.json({ error: "Sesión vencida por inactividad" }, { status: 401 })
        : redirigir(req, ruta);
      respuesta.cookies.set(NOMBRE_COOKIE, "", cookieBorrada());
      respuesta.cookies.set(COOKIE_ACTIVIDAD, "", cookieBorrada());
      return respuesta;
    }
  }

  // Un rol desconocido en el token no habilita nada: se trata como no-admin.
  const rol = esRol(sesion.rol) ? sesion.rol : null;

  // El titular accediendo a SU propia ficha no es "solo admin": el portal lo necesita.
  const esPropiaFicha = esApiPersonasDePropioTitular(ruta, req, sesion);

  if (soloKardex && rol !== "KARDEX" && rol !== "admin") {
    return NextResponse.json({ error: "Requiere permisos de Kardex" }, { status: 403 });
  }

  if (adminOKardex && rol !== "admin" && rol !== "KARDEX" && !esPropiaFicha) {
    return esApi
      ? NextResponse.json({ error: "Requiere permisos de administrador o Kardex" }, { status: 403 })
      : redirigir(req, ruta);
  }

  if (soloAdmin && rol !== "admin" && !esPropiaFicha) {
    return esApi
      ? NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 })
      : redirigir(req, ruta);
  }

  if (regla && (!rol || !regla.roles.includes(rol))) {
    // Con sesión pero del rol equivocado: a su portal, no a /login.
    const destino =
      rol === "admin"
        ? "/admin/dashboard"
        : rol === "KARDEX"
          ? "/kardex/solicitudes"
          : rol === "TITULADO" || rol === "EGRESADO"
            ? `/portal/${rol.toLowerCase()}`
            : "/login";
    const url = req.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Sesión válida: se renueva la marca de actividad.
  const respuesta = NextResponse.next();
  respuesta.cookies.set(COOKIE_ACTIVIDAD, String(Date.now()), {
    path: "/",
    sameSite: "lax",
    maxAge: VIDA_COOKIE_SEGUNDOS,
    httpOnly: true,
    secure: esCookieSegura(),
  });
  return respuesta;
}

function redirigir(req: NextRequest, ruta: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?origen=" + encodeURIComponent(ruta);
  return NextResponse.redirect(url);
}

function cookieBorrada() {
  return {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: esCookieSegura(),
  };
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/portal/:path*",
    "/api/personas/:path*",
    "/api/usuarios/:path*",
    "/api/exportar/:path*",
    "/api/importar/:path*",
    "/api/auditoria/:path*",
    "/api/respaldar/:path*",
    "/api/registros/:path*",
    "/api/noticias/:path*",
    "/api/mis-datos/:path*",
    "/kardex/:path*",
    "/api/kardex/:path*",
    "/api/carreras/:path*",
    "/api/solicitudes/:path*",
    "/api/correo/:path*",
  ],
};