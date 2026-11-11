import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas, credencialesPersona } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/password";
import { registrarAuditoria, ipDesde } from "@/lib/auditoria";
import { errorInterno, verificarCsrf } from "@/lib/guards";
import { verificarLimite, registrarIntento, limpiarIntentos } from "@/lib/rateLimit";
import { revocarSesionesDePersona } from "@/lib/sesiones";
import { z } from "zod";

export const dynamic = "force-dynamic";

const cuerpoSchema = z.object({
  ci: z.string().trim().min(1, "La CI es obligatoria"),
  passwordActual: z.string().min(1, "Ingrese su contraseña actual"),
  correo: z.string().trim().toLowerCase().email("Correo inválido").max(254),
  password: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres").max(200),
});

/**
 * Cambio de la credencial de acceso (CI → correo) de un titulado/egresado.
 *
 * Antes este endpoint NO exigía autenticación: cualquiera que conociera una CI podía
 * fijar correo y contraseña de esa persona y tomar la cuenta. Ahora se exige la
 * contraseña actual (el login deja sin sesión al usuario con el cambio obligatorio,
 * por lo que no se puede depender de la cookie) y se aplica el mismo límite de intentos
 * que el login.
 */
export async function POST(req: NextRequest) {
  try {
    const denegadoCsrf = await verificarCsrf(req);
    if (denegadoCsrf) return denegadoCsrf;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const parseo = cuerpoSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: parseo.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const { passwordActual, correo, password } = parseo.data;
    const ci = parseo.data.ci.toUpperCase();

    const ip = ipDesde(req) ?? "desconocida";
    const limite = verificarLimite(ip, ci);
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiados intentos. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }

    const filas = await db
      .select({
        id: personas.id,
        tipo: personas.tipo,
        activo: personas.activo,
        cedulaIdentidad: personas.cedulaIdentidad,
        passwordHash: credencialesPersona.passwordHash,
      })
      .from(personas)
      .leftJoin(credencialesPersona, eq(credencialesPersona.idPersona, personas.id))
      .where(sql`upper(${personas.cedulaIdentidad}) = ${ci}`)
      .limit(1);

    const p = filas[0];
    // Misma respuesta para "no existe" y "contraseña incorrecta": no sirve para enumerar CI.
    if (!p || !p.passwordHash || !verifyPassword(passwordActual, p.passwordHash)) {
      registrarIntento(ip, ci);
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }
    limpiarIntentos(ip, ci);

    if (!p.activo) {
      return NextResponse.json({ error: "Registro dado de baja" }, { status: 403 });
    }
    if (p.tipo !== "TITULADO" && p.tipo !== "EGRESADO") {
      return NextResponse.json(
        { error: "Solo titulados y egresados pueden cambiar su credencial a correo" },
        { status: 403 }
      );
    }

    const existente = await db
      .select({ id: personas.id })
      .from(personas)
      .where(and(sql`lower(trim(${personas.correoElectronico})) = ${correo}`, ne(personas.id, p.id)))
      .limit(1);
    if (existente.length) {
      return NextResponse.json({ error: "El correo ya está registrado por otra persona" }, { status: 409 });
    }

    const passwordHash = hashPassword(password);

    await db.transaction(async (tx) => {
      await tx
        .update(personas)
        .set({
          correoElectronico: correo,
          correoObligatorio: true,
          cambiosCorreoRestantes: 0,
          actualizadoEn: new Date(),
        })
        .where(eq(personas.id, p.id));

      await tx
        .insert(credencialesPersona)
        .values({ idPersona: p.id, passwordHash, actualizadoEn: new Date() })
        .onConflictDoUpdate({
          target: credencialesPersona.idPersona,
          set: { passwordHash, actualizadoEn: new Date() },
        });
    });

    // La contraseña cambió: se cierran las sesiones abiertas con la anterior.
    await revocarSesionesDePersona(p.id, "cambio de credencial");

    await registrarAuditoria({
      accion: "editar",
      entidad: "sesion",
      entidadId: p.id,
      detalles: `Cambio de credencial de CI a correo electrónico: CI ${p.cedulaIdentidad}`,
      req,
    });

    return NextResponse.json({
      success: true,
      mensaje: "Correo electrónico configurado correctamente. Inicie sesión con su correo.",
      ci: p.cedulaIdentidad,
      correo,
    });
  } catch (e) {
    return errorInterno(e, "correo/cambiar");
  }
}