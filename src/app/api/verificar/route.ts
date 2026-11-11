import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { errorInterno } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { sumarIntento, validarToken } from "@/lib/verificacion";

export const dynamic = "force-dynamic";

/**
 * GET /api/verificar?token=...
 *
 * Segunda mitad del alta pública (D5, opción B): el egresado abre el enlace recibido por
 * correo y con esto demuestra que controla el buzón.
 *
 * Verificar el correo NO valida el registro: eso lo hace un administrador, en
 * `/api/registros/[id]`. Lo único que cambia aquí es que el enlace queda marcado como
 * usado; el registro sigue PENDIENTE y no entra al sistema hasta la validación humana.
 * Se deja constancia en `audit_log` de que la verificación se completó.
 *
 * Ruta pública: el token ES la credencial. Por eso está limitada a 5 intentos por
 * enlace y expira a las 48 horas.
 */

const MENSAJES: Record<string, string> = {
  invalido: "El enlace no es válido.",
  usado: "Este enlace ya fue utilizado. Solicite uno nuevo.",
  expirado: "Este enlace expiró. Solicite uno nuevo.",
  demasiados_intentos: "Se agotaron los intentos de este enlace. Solicite uno nuevo.",
};

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get("token")?.trim();
    if (!token || token.length < 32 || token.length > 128) {
      return NextResponse.json(
        { ok: false, motivo: "invalido", error: MENSAJES.invalido },
        { status: 400 }
      );
    }

    const resultado = await validarToken(token);
    if (!resultado.ok) {
      if (resultado.motivo !== "usado") await sumarIntento(token);
      return NextResponse.json(
        { ok: false, motivo: resultado.motivo, error: MENSAJES[resultado.motivo] },
        { status: 400 }
      );
    }

    const persona = await db
      .select({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
        correoElectronico: personas.correoElectronico,
        estadoRegistro: personas.estadoRegistro,
      })
      .from(personas)
      .where(eq(personas.id, resultado.idPersona))
      .limit(1);

    if (!persona[0]) {
      return NextResponse.json(
        { ok: false, motivo: "invalido", error: MENSAJES.invalido },
        { status: 404 }
      );
    }

    await registrarAuditoria({
      accion: "editar",
      entidad: "verificacion",
      entidadId: persona[0].id,
      idUsuario: null,
      detalles: `Correo verificado por ${persona[0].nombresApellidos} (CI ${persona[0].cedulaIdentidad}) · estado del registro: ${persona[0].estadoRegistro}`,
      req,
    });

    return NextResponse.json({
      ok: true,
      mensaje:
        "Su correo quedó verificado. La Carrera de Estadística revisará su solicitud y " +
        "le notificará cuando su registro sea validado.",
      estado: persona[0].estadoRegistro,
      nombre: persona[0].nombresApellidos,
    });
  } catch (e) {
    return errorInterno(e, "api/verificar GET");
  }
}