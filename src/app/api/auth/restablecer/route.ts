import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { credencialesPersona, personas, verificaciones } from "@/db/schema";
import { errorInterno } from "@/lib/guards";
import { ipDesde, registrarAuditoria } from "@/lib/auditoria";
import { hashPassword } from "@/lib/password";
import { registrarIntento, verificarLimite } from "@/lib/rateLimit";
import { revocarSesionesDePersona } from "@/lib/sesiones";

export const dynamic = "force-dynamic";

const restablecerSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
});

export async function POST(req: NextRequest) {
  try {
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
    const tokenHash = createHash("sha256").update(parseo.data.token).digest("hex");
    const limite = verificarLimite(ip, `restablecer:${tokenHash}`);
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiados intentos. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }
    registrarIntento(ip, `restablecer:${tokenHash}`);

    const ahora = new Date();
    const passwordHash = hashPassword(parseo.data.password);
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
        return null;
      }

      await tx
        .insert(credencialesPersona)
        .values({ idPersona: persona.id, passwordHash, actualizadoEn: ahora })
        .onConflictDoUpdate({
          target: credencialesPersona.idPersona,
          set: { passwordHash, actualizadoEn: ahora },
        });
      return persona;
    });

    if (!resultado) {
      return NextResponse.json(
        { error: "El enlace no es válido o ya venció. Solicite uno nuevo." },
        { status: 400 }
      );
    }

    await revocarSesionesDePersona(resultado.id, "Cambio o configuración de contraseña");
    await registrarAuditoria({
      accion: "editar",
      entidad: "credenciales",
      entidadId: resultado.id,
      detalles: `Contraseña configurada o restablecida para CI ${resultado.ci}`,
      req,
    });

    return NextResponse.json({ actualizado: true });
  } catch (e) {
    return errorInterno(e, "api/auth/restablecer POST");
  }
}
