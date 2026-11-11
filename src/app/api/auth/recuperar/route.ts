import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { personas, verificaciones } from "@/db/schema";
import { correoConfigurado, enviarCorreoRecuperacion } from "@/lib/correo";
import { errorInterno, verificarCsrf } from "@/lib/guards";
import { ipDesde } from "@/lib/auditoria";
import { registrarIntento, verificarLimite } from "@/lib/rateLimit";
import { verificarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const solicitudSchema = z.object({
  ci: z.string().trim().regex(/^[0-9]{4,12}$/),
  correo: z.string().trim().email().max(150),
  turnstileToken: z.string().nullable().optional(),
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

    const parseo = solicitudSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json({ error: "Ingrese una CI y un correo válidos." }, { status: 400 });
    }

    const ip = ipDesde(req) ?? "desconocida";
    const ci = parseo.data.ci.trim().toUpperCase();
    const limite = verificarLimite(ip, `recuperar:${ci}`);
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }
    registrarIntento(ip, `recuperar:${ci}`);

    const captcha = await verificarTurnstile(parseo.data.turnstileToken, ip);
    if (!captcha.valido) {
      return NextResponse.json(
        { error: captcha.motivo ?? "Verificación de seguridad fallida." },
        { status: 403 }
      );
    }

    if (!correoConfigurado()) {
      return NextResponse.json(
        { error: "El envío de correo no está configurado. Contacte a la Carrera de Estadística." },
        { status: 503 }
      );
    }

    const respuesta = {
      mensaje:
        "Si la CI y el correo coinciden con un registro habilitado, recibirá un enlace para configurar su contraseña. " +
        "Si no llega en unos minutos, contacte a la Carrera de Estadística.",
    };

    const persona = await db
      .select({
        id: personas.id,
        nombre: personas.nombresApellidos,
        correo: personas.correoElectronico,
      })
      .from(personas)
      .where(
        and(
          sql`upper(${personas.cedulaIdentidad}) = ${ci}`,
          sql`lower(trim(${personas.correoElectronico})) = ${parseo.data.correo.toLowerCase()}`,
          eq(personas.activo, true),
          eq(personas.estadoRegistro, "VALIDADO")
        )
      )
      .limit(1);

    if (!persona[0]?.correo) return NextResponse.json(respuesta, { status: 202 });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiraEn = new Date(Date.now() + 30 * 60 * 1000);

    await db
      .update(verificaciones)
      .set({ usadaEn: new Date() })
      .where(
        and(
          eq(verificaciones.idPersona, persona[0].id),
          eq(verificaciones.proposito, "RECUPERACION"),
          isNull(verificaciones.usadaEn)
        )
      );

    await db.insert(verificaciones).values({
      idPersona: persona[0].id,
      proposito: "RECUPERACION",
      tokenHash,
      destino: persona[0].correo,
      expiraEn,
    });

    const envio = await enviarCorreoRecuperacion({
      destino: persona[0].correo,
      nombre: persona[0].nombre,
      token,
    });

    if (!envio.enviado) {
      await db
        .update(verificaciones)
        .set({ usadaEn: new Date() })
        .where(eq(verificaciones.tokenHash, tokenHash));
      console.error(`[recuperacion] No se pudo enviar correo para persona ${persona[0].id}: ${envio.motivo}`);
    }

    return NextResponse.json(respuesta, { status: 202 });
  } catch (e) {
    return errorInterno(e, "api/auth/recuperar POST");
  }
}
