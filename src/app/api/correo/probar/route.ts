import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  correoConfigurado,
  enviarCorreoPrueba,
  type ResultadoEnvio,
} from "@/lib/correo";
import { errorInterno, exigirAdmin, verificarCsrf } from "@/lib/guards";
import { ipDesde } from "@/lib/auditoria";
import { registrarIntento, verificarLimite } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const destinoSchema = z.object({ destino: z.string().trim().email().max(150) });

/**
 * Diagnóstico del correo SMTP (solo administrador).
 *
 * `GET`  → indica si el SMTP está configurado y por qué puerto se intentará.
 * `POST` → envía un correo de prueba y devuelve el resultado real del envío.
 *
 * Sirve para validar credenciales (Brevo, Gmail, etc.) desde el propio sistema, sin
 * depender de la terminal ni de un script aparte.
 */
export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  return NextResponse.json({
    configurado: correoConfigurado(),
    host: process.env.SMTP_HOST?.trim() || null,
    puerto: Number(process.env.SMTP_PORT?.trim() || 587),
    remitente: (process.env.CORREO_REMITENTE?.trim() || process.env.SMTP_USER?.trim() || null),
    respaldoActivo: process.env.SMTP_FALLBACK?.trim().toLowerCase() !== "false",
  });
}

export async function POST(req: NextRequest) {
  try {
    const denegado = await exigirAdmin(req);
    if (denegado) return denegado;

    const denegadoCsrf = await verificarCsrf(req);
    if (denegadoCsrf) return denegadoCsrf;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = destinoSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json({ error: "Ingrese un correo de destino válido." }, { status: 400 });
    }

    const ip = ipDesde(req) ?? "desconocida";
    const limite = verificarLimite(ip, "correo:probar");
    if (!limite.permitido) {
      return NextResponse.json(
        { error: `Demasiadas pruebas. Intente nuevamente en ${limite.minutosEspera} minuto(s).` },
        { status: 429 }
      );
    }
    registrarIntento(ip, "correo:probar");

    if (!correoConfigurado()) {
      return NextResponse.json(
        {
          error:
            "El SMTP no está configurado. Complete SMTP_HOST, SMTP_USER, SMTP_PASS y CORREO_REMITENTE en el .env del servidor.",
        },
        { status: 503 }
      );
    }

    const resultado: ResultadoEnvio = await enviarCorreoPrueba(parseo.data.destino);
    if (!resultado.enviado) {
      return NextResponse.json(
        {
          enviado: false,
          motivo: resultado.motivo,
          error:
            "El servidor SMTP rechazó el envío. Revise el log del contenedor (docker logs sistitulados_app) para ver el detalle.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ enviado: true });
  } catch (e) {
    return errorInterno(e, "api/correo/probar POST");
  }
}
