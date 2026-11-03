import { NextResponse, type NextRequest } from "next/server";
import { DURACION_SESION_MS, NOMBRE_COOKIE, leerSesionDeRequest } from "@/lib/sesion";

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

/** Ventana de inactividad: 15 min sin petición y la sesión se cae. */
const INACTIVIDAD_MS = 15 * 60 * 1000;

/**
 * Cookie auxiliar solo para el middleware. El token HMAC no se puede modificar (eso es
 * lo bueno de la firma), así que "última actividad" tiene que vivir aparte, en una
 * cookie normal que el middleware sí puede reescribir en cada respuesta.
 */
const COOKIE_ACTIVIDAD = "seguit_actividad";

/** Páginas: se redirige a /login porque el navegador sigue siendo una página. */
const RUTAS_POR_ROL: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/portal/titulado", roles: ["TITULADO", "admin"] },
  { prefijo: "/portal/egresado", roles: ["EGRESADO", "admin"] },
  { prefijo: "/kardex", roles: ["KARDEX"] },
];

/**
 * APIs que exigen sesión de administrador. Es una lista centralizada a propósito: si
 * alguien agrega una ruta nueva y olvida el guard, esta capa la detiene igual.
 *
 * Se acumulan en un Set para que `/api/usuarios` cubra a la vez `/api/usuarios` y
 * `/api/usuarios/12`, sin tener que escribir el comodín a mano.
 */
const APIS_SOLO_ADMIN = [
  "/api/personas",
  "/api/usuarios",
  "/api/exportar",
  "/api/importar",
  "/api/auditoria",
  "/api/respaldar",
];

const APIS_SOLO_KARDEX = ["/api/kardex"];
const APIS_REQUIEREN_SESION = ["/api/carreras", "/api/solicitudes"];

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
  const ruta = req.nextUrl.pathname;
  const esApi = ruta.startsWith("/api/");

  const regla = RUTAS_POR_ROL.find((r) => ruta === r.prefijo || ruta.startsWith(`${r.prefijo}/`));
  const soloAdmin = APIS_SOLO_ADMIN.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const soloKardex = APIS_SOLO_KARDEX.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const requiereSesion = APIS_REQUIEREN_SESION.some((p) => ruta === p || ruta.startsWith(`${p}/`));
  const conSesion = APIS_CON_SESION.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  // `/api/noticias` se lee sin sesión (es contenido público), pero `/api/mis-datos`
  // NO: son datos personales de un titular, y su lectura exige estar autenticado como
  // esa persona. Sin esta separación, la rama de "lectura pública" de abajo dejaría
  // pasar un GET a los datos de cualquier egresado sin cookie ninguna.
  const soloLecturaPublica = (p: string) => ruta === p || ruta.startsWith(`${p}/`);
  const lecturaPublica =
    soloLecturaPublica("/api/noticias") &&
    req.method === "GET" &&
    req.nextUrl.searchParams.get("admin") !== "1";

  if (!regla && !soloAdmin && !soloKardex && !requiereSesion && (!conSesion || lecturaPublica)) return NextResponse.next();

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
  // La comprobación anterior comparaba `ultimaActividad`, que `leerSesionDeRequest`
  // pone siempre en `Date.now()`: la diferencia era siempre 0 y el corte por inactividad
  // no se disparaba nunca. Ahora la marca viaja en una cookie que el middleware escribe
  // en cada respuesta.
  const actividadPrevia = Number(req.cookies.get(COOKIE_ACTIVIDAD)?.value ?? 0);
  if (actividadPrevia > 0 && Date.now() - actividadPrevia > INACTIVIDAD_MS) {
    const respuesta = esApi
      ? NextResponse.json({ error: "Sesión vencida por inactividad" }, { status: 401 })
      : redirigir(req, ruta);
    respuesta.cookies.set(NOMBRE_COOKIE, "", cookieBorrada());
    respuesta.cookies.set(COOKIE_ACTIVIDAD, "", cookieBorrada());
    return respuesta;
  }

  // Un rol desconocido en el token no habilita nada: se trata como no-admin.
  const rol = esRol(sesion.rol) ? sesion.rol : null;

  // El titular accediendo a SU propia ficha no es "solo admin": el portal lo necesita.
  const esPropiaFicha = esApiPersonasDePropioTitular(ruta, req, sesion);

  if (soloKardex && rol !== "KARDEX") {
    return NextResponse.json({ error: "Requiere permisos de Kardex" }, { status: 403 });
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
    maxAge: Math.floor(DURACION_SESION_MS / 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
    secure: process.env.NODE_ENV === "production",
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
    "/api/noticias/:path*",
    "/api/mis-datos/:path*",
    "/kardex/:path*",
    "/api/kardex/:path*",
    "/api/carreras/:path*",
    "/api/solicitudes/:path*",
  ],
};