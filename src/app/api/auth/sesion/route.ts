import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registrarAuditoria, ipDesde } from "@/lib/auditoria";
import { errorInterno } from "@/lib/guards";
import {
  DURACION_SESION_MS,
  NOMBRE_COOKIE,
  leerSesionDeRequest,
  opcionesCookie,
} from "@/lib/sesion";
import {
  limpiarSesionesVencidas,
  revocarSesion,
  sesionEstaVigente,
  tokenDeRequest,
} from "@/lib/sesiones";

export const dynamic = "force-dynamic";

/**
 * Fuente única de verdad del estado de sesión (decisión D1, aprobada).
 *
 * Antes este archivo devolvía `{"message": "Sesión funcionando"}` sin mirar la cookie,
 * así que el frontend no tenía forma de saber quién está conectado y cada pantalla
 * repetía su propia validación.
 *
 * Contrato:
 *   GET  → 200 con los datos de quien está conectado, o 401 si no hay sesión válida.
 *   POST → cierre de sesión: revoca el registro en `sesiones`, borra la cookie y
 *          deja la operación anotada en `audit_log`. Responde 200 incluso sin sesión,
 *          porque cerrar sesión nunca debe fallar.
 *
 * Nota sobre `accion`: el enum `audit_accion_enum` no tiene valores "login"/"logout",
 * así que se usan `crear` y `eliminar` sobre la entidad `sesion`, que describen el
 * evento con precisión ("se creó una sesión" / "se eliminó una sesión").
 */

const ROLES_CONOCIDOS = new Set(["admin", "TITULADO", "EGRESADO", "KARDEX"]);

export async function GET(req: NextRequest) {
  try {
    const sesion = await leerSesionDeRequest(req);
    if (!sesion) {
      return NextResponse.json({ autenticado: false }, { status: 200 });
    }

    // El token firmado puede seguir siendo criptográficamente válido aunque la sesión
    // se haya revocado (logout en otro dispositivo, cambio de contraseña). La fila de
    // `sesiones` es la que manda.
    const token = tokenDeRequest(req);
    if (token && !(await sesionEstaVigente(token))) {
      const respuesta = NextResponse.json(
        { autenticado: false, error: "La sesión fue revocada" },
        { status: 401 }
      );
      respuesta.cookies.set(NOMBRE_COOKIE, "", opcionesCookie(0));
      return respuesta;
    }

    // Si el rol del token no es uno conocido, no se devuelve nada: un rol inventado
    // habilita menos, nunca más.
    if (!ROLES_CONOCIDOS.has(sesion.rol)) {
      const respuesta = NextResponse.json(
        { autenticado: false, error: "Rol desconocido" },
        { status: 401 }
      );
      respuesta.cookies.set(NOMBRE_COOKIE, "", opcionesCookie(0));
      return respuesta;
    }

    return NextResponse.json({
      autenticado: true,
      id: sesion.sub,
      rol: sesion.rol,
      ci: sesion.ci,
      nombre: sesion.nombre ?? null,
      correo: sesion.correo ?? null,
      expiraEn: Date.now() + DURACION_SESION_MS,
    });
  } catch (e) {
    return errorInterno(e, "auth/sesion GET");
  }
}

/**
 * El cierre de sesión no lleva datos. Si llega un cuerpo, el cliente está
 * desincronizado y conviene enterarse en vez de ignorarlo en silencio.
 */
async function exigirCierreSinCuerpo(req: NextRequest): Promise<void> {
  const limpio = (await req.text()).trim();
  if (limpio !== "") throw new Error("CUERPO_NO_ESPERADO_EN_LOGOUT");
}

export async function POST(req: NextRequest) {
  try {
    await exigirCierreSinCuerpo(req);
    const token = tokenDeRequest(req);

    // El logout se resuelve primero desde la cookie: si la sesión ya expiró, el token
    // no se puede verificar y sin embargo hay que cerrar la sesión igualmente.
    const sesion = await leerSesionDeRequest(req);

    if (token) {
      await revocarSesion(token, "Cierre de sesión del usuario");
    }

    if (sesion) {
      // Las cuentas administrativas (admin/Kardex) se anotan contra `usuarios`. Un
      // titular sin cuenta propia se registra con `idUsuario` nulo.
      const esCuentaAdministrativa = sesion.rol === "admin" || sesion.rol === "KARDEX";
      const idUsuario = esCuentaAdministrativa ? sesion.sub : null;

      // Comprobación adicional: si la cuenta administrativa fue desactivada o bloqueada
      // mientras tenía la sesión abierta, el cierre de sesión lo refleja en el log.
      let estadoAdmin: string | null = null;
      if (esCuentaAdministrativa) {
        const filas = await db
          .select({ estado: usuarios.estado })
          .from(usuarios)
          .where(eq(usuarios.id, sesion.sub))
          .limit(1);
        estadoAdmin = filas[0]?.estado ?? null;
      }

      await registrarAuditoria({
        accion: "eliminar",
        entidad: "sesion",
        entidadId: sesion.sub,
        idUsuario,
        detalles:
          `Cierre de sesión de ${sesion.nombre ?? sesion.ci} (${sesion.rol})` +
          (estadoAdmin ? ` · estado de la cuenta: ${estadoAdmin}` : "") +
          ` · IP ${ipDesde(req) ?? "desconocida"}`,
        req,
      });
    }

    // La limpieza de filas vencidas se lanza sin esperar: no puede hacer fallar el
    // cierre de sesión.
    void limpiarSesionesVencidas();

    const respuesta = NextResponse.json({ cerrado: true });
    respuesta.cookies.set(NOMBRE_COOKIE, "", opcionesCookie(0));
    return respuesta;
  } catch (e) {
    return errorInterno(e, "auth/sesion POST");
  }
}