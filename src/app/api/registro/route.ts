import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { errorInterno, verificarCsrf } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  personaRegistroPublicoSchema,
  primerErrorZod,
  type PersonaRegistroPublicoInput,
} from "@/lib/validaciones";
import { crearVerificacion } from "@/lib/verificacion";
import { enviarCorreoVerificacion } from "@/lib/correo";
import { registrarIntento, verificarLimite } from "@/lib/rateLimit";
import { ipDesde } from "@/lib/auditoria";
import { verificarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

function sinConsentimiento(datos: PersonaRegistroPublicoInput) {
  const {
    consentimientoPrivacidad: _c,
    versionAvisoPrivacidad: _v,
    turnstileToken: _t,
    ...persona
  } = datos;
  return persona;
}

/**
 * POST /api/registro  ·  ALTA PÚBLICA (decisión D5, opción B)
 *
 * Es la ÚNICA ruta del sistema que acepta escritura sin sesión, y a propósito no está en
 * la lista de prefijos protegidos de `src/middleware.ts`. Como no hay ninguna credencial
 * que verificar, se apoya en tres cosas:
 *
 *   1. Rate limit por IP, para que no se pueda automatizar el envío de solicitudes.
 *   2. El registro nace `PENDIENTE`: no entra al sistema ni cuenta en las métricas hasta
 *      que un administrador lo valida (y hasta que se verifica el correo).
 *   3. Respuesta idéntica exista o no la cédula, para no poder enumerar quién está en el
 *      sistema. Solo quien controla el correo recibe el enlace de verificación.
 */

export async function POST(req: NextRequest) {
  try {
    const denegadoCsrf = await verificarCsrf(req);
    if (denegadoCsrf) return denegadoCsrf;

    // ── Límite de intentos ──────────────────────────────────────────────────────
    // Sin cuenta contra la que contar, el contador es por IP. Si se llegara a colar
    // una cédula ajena, el alta quedaría PENDIENTE y sin verificar, es decir inútil.
    const ip = ipDesde(req) ?? "desconocida";
    const limite = verificarLimite(ip, "registro-publico");
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiados intentos. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }

    // ── Validar entrada ────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = personaRegistroPublicoSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: primerErrorZod(parseo.error), campos: parseo.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const datos = parseo.data;

    const captcha = await verificarTurnstile(datos.turnstileToken, ip);
    if (!captcha.valido) {
      return NextResponse.json(
        { error: captcha.motivo ?? "Verificación de seguridad fallida." },
        { status: 403 }
      );
    }

    if (!datos.correoElectronico) {
      return NextResponse.json(
        { error: "Debe indicar un correo electrónico", campos: { correoElectronico: ["Obligatorio"] } },
        { status: 400 }
      );
    }

    const RESPUESTA_NEUTRA = {
      mensaje:
        "Si los datos son correctos, se le enviará un correo para verificar. " +
        "Si ya está registrado, revise su correo o contacte a la Carrera.",
    };
    const responderNeutro = () =>
      NextResponse.json(RESPUESTA_NEUTRA, { status: 202 });

    const ci = datos.cedulaIdentidad.trim().toUpperCase();
    const correoNorm = datos.correoElectronico.trim().toLowerCase();
    const existentes = await db
      .select({ id: personas.id, activo: personas.activo, estadoRegistro: personas.estadoRegistro })
      .from(personas)
      .where(
        or(
          eq(personas.cedulaIdentidad, ci),
          sql`lower(${personas.correoElectronico}) = ${correoNorm}`
        )
      )
      .limit(1);

    if (existentes.length) {
      registrarIntento(ip, "registro-publico");
      return responderNeutro();
    }

    // ── Crear el registro en estado PENDIENTE ───────────────────────────────────
    const tiempoEgresoTitulacionMeses =
      datos.anioEgreso && datos.anioTitulacion
        ? (datos.anioTitulacion - datos.anioEgreso) * 12
        : null;

    // La fecha del consentimiento se toma AHORA, en el servidor, y no del cuerpo de la
    // petición: un cliente podría mandar cualquier fecha y falsear la constancia que la
    // Ley 1405 art. 5.1.b exige poder demostrar. El reloj del servidor es la única
    // fuente fiable, igual que ya se hace con `creado_en`.
    const consentimientoEn = new Date();

    const [creado] = await db
      .insert(personas)
      .values({
        // El consentimiento NO se copia de `datos`: son campos de transporte (la
        // casilla y la versión declarada por el cliente), no columnas. Lo que se guarda
        // es la constancia server-side, con la fecha del servidor.
        ...sinConsentimiento(datos),
        cedulaIdentidad: ci,
        activo: true,
        estadoRegistro: "PENDIENTE",
        consentimientoOtorgado: true,
        consentimientoOtorgadoEn: consentimientoEn,
        consentimientoVersion: datos.versionAvisoPrivacidad,
        consentimientoIp: ip,
        tiempoEgresoTitulacionMeses:
          tiempoEgresoTitulacionMeses !== null && tiempoEgresoTitulacionMeses >= 0
            ? tiempoEgresoTitulacionMeses
            : null,
      })
      .returning();

    if (!creado) {
      return NextResponse.json(
        { error: "No se pudo crear el registro. Intente nuevamente." },
        { status: 500 }
      );
    }

    // ── Enlace de verificación ─────────────────────────────────────────────────
    const token = await crearVerificacion({
      idPersona: creado.id,
      destino: creado.correoElectronico!,
      proposito: "REGISTRO",
    });

    const envio = await enviarCorreoVerificacion({
      destino: creado.correoElectronico!,
      nombre: creado.nombresApellidos,
      token,
    });

    await registrarAuditoria({
      accion: "consentimiento",
      entidad: "personas",
      entidadId: creado.id,
      idUsuario: null,
      detalles:
        `Consentimiento al aviso de privacidad v${datos.versionAvisoPrivacidad} otorgado · ` +
        `CI ${ci} · IP ${ip}`,
      req,
    });

    await registrarAuditoria({
      accion: "crear",
      entidad: "personas",
      entidadId: creado.id,
      idUsuario: null,
      detalles: `Alta pública PENDIENTE de ${creado.nombresApellidos} (CI ${ci}) · correo enviado: ${envio.enviado ? "sí" : "no"} (${envio.motivo ?? "ok"})`,
      req,
    });

    registrarIntento(ip, "registro-publico");

    // En producción NUNCA se devuelve el token secreto en la respuesta HTTP (evita bypass
    // de verificación de buzón y enumeración de cédulas si el SMTP falla).
    const incluirEnlaceSoloDev =
      !envio.enviado && process.env.NODE_ENV !== "production"
        ? { enlaceVerificacion: `/verificar?token=${token}` }
        : {};

    return NextResponse.json(
      {
        ...RESPUESTA_NEUTRA,
        ...incluirEnlaceSoloDev,
      },
      { status: 202 }
    );
  } catch (e) {
    return errorInterno(e, "api/registro POST");
  }
}