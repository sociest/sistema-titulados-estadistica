import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { credencialesPersona, personas, usuarios } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { HASH_SENUELO, verifyPasswordAsync } from "@/lib/password";
import {
  COOKIE_ACTIVIDAD,
  DURACION_SESION_MS,
  NOMBRE_COOKIE,
  crearToken,
  opcionesCookie,
  opcionesCookieActividad,
} from "@/lib/sesion";
import { loginSchema, primerErrorZod } from "@/lib/validaciones";
import { registrarAuditoria, ipDesde } from "@/lib/auditoria";
import { errorInterno, verificarCsrf } from "@/lib/guards";
import { verificarLimite, registrarIntento, limpiarIntentos } from "@/lib/rateLimit";
import { registrarSesion } from "@/lib/sesiones";
import { verificarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const denegadoCsrf = await verificarCsrf(req);
    if (denegadoCsrf) return denegadoCsrf;

    // ── Validar entrada ────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = loginSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json({ error: primerErrorZod(parseo.error) }, { status: 400 });
    }

    const entrada = parseo.data.ci.trim().toUpperCase();
    const password = parseo.data.password ?? "";
    const turnstileToken = parseo.data.turnstileToken;
    const cookieStore = await cookies(); // Obtenemos el almacén de cookies de forma asíncrona

    // ── Validación de Cloudflare Turnstile (Anti-bots) ─────────────────────────
    const ip = ipDesde(req) ?? "desconocida";
    const verif = await verificarTurnstile(turnstileToken, ip);
    if (!verif.valido) {
      return NextResponse.json(
        { error: verif.motivo || "Verificación de seguridad fallida. Por favor, intente nuevamente." },
        { status: 403 }
      );
    }
    const limite = verificarLimite(ip, entrada);

    if (!limite.permitido) {
      await registrarAuditoria({
        accion: "editar",
        entidad: "sesion",
        detalles: `Login bloqueado por exceso de intentos · ${entrada} · IP ${ip}`,
        req,
      });
      return NextResponse.json(
        {
          error: `Demasiados intentos fallidos. Intente nuevamente en ${limite.minutosEspera} minuto(s).`,
        },
        { status: 429 }
      );
    }

    // Todo fallo cuenta como intento.
    const fallo = async (detalle: string) => {
      registrarIntento(ip, entrada);
      await registrarAuditoria({ accion: "editar", entidad: "sesion", detalles: detalle, req });
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    };

    // ── 1) Administradores (por correo O por CI) ──────────────────────────────
    const admins = await db
      .select()
      .from(usuarios)
      .where(
        and(
          eq(usuarios.estado, "activo"),
          or(
            eq(usuarios.correo, entrada.toLowerCase()),
            eq(usuarios.ci, entrada)
          )
        )
      )
      .limit(1);

    if (admins.length) {
      const u = admins[0]!;
      const esPasswordValido = await verifyPasswordAsync(password, u.passwordHash);

      if (!esPasswordValido) {
        return await fallo(`Intento de acceso fallido al administrador ${u.correo}`);
      }

      if (u.rol !== "admin" && u.rol !== "KARDEX") {
        return await fallo(`Intento de acceso con rol no habilitado ${u.rol}`);
      }

      limpiarIntentos(ip, entrada);

      const ahoraMs = Date.now();
      const token = await crearToken(
        {
          sub: u.id,
          rol: u.rol,
          ci: (u.ci ?? "").toUpperCase(),
          nombre: u.nombre,
          correo: u.correo,
        },
        ahoraMs
      );

      cookieStore.set(NOMBRE_COOKIE, token, opcionesCookie());
      cookieStore.set(COOKIE_ACTIVIDAD, String(ahoraMs), opcionesCookieActividad());

      await registrarSesion({
        token,
        idUsuario: u.id,
        ci: u.ci ?? "",
        rol: u.rol,
        expiracionMs: DURACION_SESION_MS,
        ip: ipDesde(req),
        userAgent: req.headers.get("user-agent"),
      });

      await registrarAuditoria({
        accion: "crear",
        entidad: "sesion",
        entidadId: u.id,
        idUsuario: u.id,
        detalles: `Inicio de sesión administrativo de ${u.correo} (${u.rol})`,
        req,
      });

      return NextResponse.json({
        rol: u.rol,
        ci: u.ci ?? "",
        nombre: u.nombre,
        correo: u.correo,
        id: u.id,
      });
    }

    // ── 2) Titulados y egresados (por cédula o correo) ─────────────────────────
    const personasRows = await db
      .select({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
        tipo: personas.tipo,
        correoElectronico: personas.correoElectronico,
        activo: personas.activo,
        estadoRegistro: personas.estadoRegistro,
        passwordHash: credencialesPersona.passwordHash,
        correoObligatorio: personas.correoObligatorio,
        cambiosCorreoRestantes: personas.cambiosCorreoRestantes,
      })
      .from(personas)
      .leftJoin(credencialesPersona, eq(credencialesPersona.idPersona, personas.id))
      .where(
        or(
          eq(personas.cedulaIdentidad, entrada),
          sql`lower(${personas.correoElectronico}) = ${entrada.toLowerCase()}`
        )
      )
      .limit(2);

    if (personasRows.length > 1) {
      await verifyPasswordAsync(password, HASH_SENUELO);
      return await fallo(`Intento de acceso con correo compartido ${entrada}`);
    }
    const persona = personasRows[0];
    const credencialesInvalidas = async () =>
      await fallo(`Intento de acceso fallido con identificador ${entrada}`);

    if (!persona) {
      await verifyPasswordAsync(password, HASH_SENUELO);
      return await credencialesInvalidas();
    }

    if (!persona.passwordHash || !(await verifyPasswordAsync(password, persona.passwordHash))) {
      return await credencialesInvalidas();
    }

    if (!persona.activo) {
      registrarIntento(ip, entrada);
      await registrarAuditoria({
        accion: "editar",
        entidad: "sesion",
        entidadId: persona.id,
        detalles: `Intento de acceso a un registro dado de baja: CI ${entrada}`,
        req,
      });
      return NextResponse.json(
        {
          error: "Su registro se encuentra dado de baja. Contacte a la Carrera de Estadística.",
          codigo: "REGISTRO_DADO_DE_BAJA",
        },
        { status: 403 }
      );
    }

    // Alta pública (D5): hasta que un administrador valida la solicitud, el registro no
    // habilita el acceso. Se comprueba DESPUÉS de validar la contraseña, como la baja
    // lógica, para que la respuesta no sirva para averiguar qué cédulas están pendientes
    // ni cuáles fueron rechazadas.
    if (persona.estadoRegistro !== "VALIDADO") {
      registrarIntento(ip, entrada);
      const rechazado = persona.estadoRegistro === "RECHAZADO";
      await registrarAuditoria({
        accion: "editar",
        entidad: "sesion",
        entidadId: persona.id,
        detalles: `Intento de acceso con registro ${persona.estadoRegistro}: CI ${entrada}`,
        req,
      });
      return NextResponse.json(
        {
          error: rechazado
            ? "Su solicitud de registro fue rechazada. Contacte a la Carrera de Estadística."
            : "Su solicitud de registro está pendiente de validación por la Carrera de Estadística.",
          codigo: rechazado ? "REGISTRO_RECHAZADO" : "REGISTRO_PENDIENTE",
        },
        { status: 403 }
      );
    }

    limpiarIntentos(ip, entrada);

    // ── Cambio obligatorio de CI a correo (titulares y egresados) ────────────────
    const esTituladoEgresado =
      persona.tipo === "TITULADO" || persona.tipo === "EGRESADO";
    const cambiosRestantes = esTituladoEgresado
      ? persona.cambiosCorreoRestantes
      : null;

    // Si ya se agotaron los 5 saltos, forzar cambio de correo antes de entrar.
    if (
      esTituladoEgresado &&
      !persona.correoObligatorio &&
      cambiosRestantes! <= 0
    ) {
      return NextResponse.json(
        {
          error: "Debe cambiar su credencial de acceso a correo electrónico.",
          codigo: "CORREO_OBLIGATORIO",
          ci: persona.cedulaIdentidad,
          nombre: persona.nombresApellidos,
          tipo: persona.tipo,
        },
        { status: 403 }
      );
    }

    const ahoraPersonaMs = Date.now();
    const token = await crearToken(
      {
        sub: persona.id,
        rol: persona.tipo,
        ci: persona.cedulaIdentidad,
        nombre: persona.nombresApellidos,
        correo: persona.correoElectronico,
      },
      ahoraPersonaMs
    );

    cookieStore.set(NOMBRE_COOKIE, token, opcionesCookie());
    cookieStore.set(COOKIE_ACTIVIDAD, String(ahoraPersonaMs), opcionesCookieActividad());

    await registrarSesion({
      token,
      // `id_usuario` apunta a `usuarios`; un titular sin cuenta propia no tiene fila
      // ahí, se identifica por `id_persona`.
      idUsuario: null,
      idPersona: persona.id,
      ci: persona.cedulaIdentidad,
      rol: persona.tipo,
      expiracionMs: DURACION_SESION_MS,
      ip: ipDesde(req),
      userAgent: req.headers.get("user-agent"),
    });

    await registrarAuditoria({
      accion: "editar",
      entidad: "sesion",
      entidadId: persona.id,
      idUsuario: null,
      detalles: `Inicio de sesión de ${persona.nombresApellidos} (${persona.tipo})`,
      req,
    });

    return NextResponse.json({
      rol: persona.tipo,
      ci: persona.cedulaIdentidad,
      nombre: persona.nombresApellidos,
      correo: persona.correoElectronico,
      id: persona.id,
      tipo: persona.tipo,
      // Campos para el frontend: contador de cambio obligatorio a correo
      requiereCambioCorreo:
        esTituladoEgresado && !persona.correoObligatorio,
      cambiosCorreoRestantes: cambiosRestantes ?? 0,
      correoObligatorio: persona.correoObligatorio,
    });
  } catch (e) {
    return errorInterno(e, "auth/login");
  }
}