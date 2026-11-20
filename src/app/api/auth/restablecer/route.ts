import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { credencialesPersona, personas, verificaciones } from "@/db/schema";
import { errorInterno, verificarCsrf } from "@/lib/guards";
import { ipDesde, registrarAuditoria } from "@/lib/auditoria";
import { hashPasswordAsync } from "@/lib/password";
import { registrarIntento, verificarLimite } from "@/lib/rateLimit";
import { revocarSesionesDePersona } from "@/lib/sesiones";
import { esPasswordIgualACredencial, passwordSeguraSchema } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

const restablecerSchema = z.object({
  token: z.string().trim().optional(),
  codigo: z.string().trim().regex(/^[0-9]{6}$/).optional(),
  password: passwordSeguraSchema,
}).refine((data) => data.token || data.codigo, {
  message: "Debe ingresar el código de 6 dígitos o un token válido.",
});

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

    const parseo = restablecerSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: parseo.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 }
      );
    }

    const ip = ipDesde(req) ?? "desconocida";
    const valorVerificador = parseo.data.codigo || parseo.data.token || "";
    const tokenHash = createHash("sha256").update(valorVerificador).digest("hex");
    const limite = verificarLimite(ip, `restablecer:${tokenHash}`);
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiados intentos. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }
    registrarIntento(ip, `restablecer:${tokenHash}`);

    const ahora = new Date();
    const passwordHash = await hashPasswordAsync(parseo.data.password);
    const resultado = await db.transaction(async (tx) => {
      const [token] = await tx
        .update(verificaciones)
        .set({
          usadaEn: ahora,
          intentos: sql`${verificaciones.intentos} + 1`,
        })
        .where(
          and(
            eq(verificaciones.tokenHash, tokenHash),
            eq(verificaciones.proposito, "RECUPERACION"),
            isNull(verificaciones.usadaEn),
            gt(verificaciones.expiraEn, ahora),
            lt(verificaciones.intentos, 5)
          )
        )
        .returning({
          idPersona: verificaciones.idPersona,
          destino: verificaciones.destino,
        });

      if (!token) return null;

      const [persona] = await tx
        .select({
          id: personas.id,
          ci: personas.cedulaIdentidad,
          correo: personas.correoElectronico,
        })
        .from(personas)
        .where(
          and(
            eq(personas.id, token.idPersona),
            eq(personas.activo, true),
            eq(personas.estadoRegistro, "VALIDADO")
          )
        )
        .limit(1);

      if (!persona || persona.correo?.trim().toLowerCase() !== token.destino.trim().toLowerCase()) {
        return { estado: "invalido" as const };
      }

      if (esPasswordIgualACredencial(parseo.data.password, persona.ci, persona.correo)) {
        throw new Error("PASSWORD_IGUAL_CREDENCIAL");
      }

      await tx
        .insert(credencialesPersona)
        .values({ idPersona: persona.id, passwordHash, actualizadoEn: ahora })
        .onConflictDoUpdate({
          target: credencialesPersona.idPersona,
          set: { passwordHash, actualizadoEn: ahora },
        });
      return { estado: "ok" as const, persona };
    }).catch((err) => {
      if (err instanceof Error && err.message === "PASSWORD_IGUAL_CREDENCIAL") {
        return { estado: "password_debil" as const };
      }
      throw err;
    });

    if (resultado?.estado === "password_debil") {
      return NextResponse.json(
        { error: "Por seguridad, la nueva contraseña no puede ser igual a su CI ni a su correo." },
        { status: 400 }
      );
    }

    if (!resultado || resultado.estado !== "ok") {
      return NextResponse.json(
        { error: "El código o enlace no es válido o ya venció (10 min). Solicite uno nuevo." },
        { status: 400 }
      );
    }

    const personaActualizada = resultado.persona;
    await revocarSesionesDePersona(personaActualizada.id, "Cambio o configuración de contraseña");
    await registrarAuditoria({
      accion: "editar",
      entidad: "credenciales",
      entidadId: personaActualizada.id,
      detalles: `Contraseña configurada o restablecida para CI ${personaActualizada.ci}`,
      req,
    });

    return NextResponse.json({ actualizado: true });
  } catch (e) {
    return errorInterno(e, "api/auth/restablecer POST");
  }
}
