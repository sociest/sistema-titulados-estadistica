import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, errorInterno, leerSesionVigente, verificarCsrf } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { firmarDescarga } from "@/lib/descargas";
import { enlaceDescargaSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * POST /api/exportar/enlace  (SOLO ADMIN)
 *
 * Devuelve una URL de descarga TEMPORAL para uno de los exportadores. La interfaz de
 * administración pide aquí el enlace en el momento en que el usuario pulsa el botón, y
 * lo usa enseguida; nunca se guarda ni se muestra (ISO/IEC 27001:2022, A.8.12,
 * prevención de fuga de datos).
 *
 * No se permite pedir el enlace por GET: una URL que devuelve una URL firmada por GET
 * sería, en sí misma, la URL firmada, y quedaría en el historial del navegador igual que
 * se pretendía evitar.
 *
 * Cuerpo: { destino: "excel" | "csv" | "pdf", params?: {...} }
 */

const DESTINOS = {
  excel: { ruta: "/api/exportar", formato: "excel" },
  csv: { ruta: "/api/exportar", formato: "csv" },
  pdf: { ruta: "/api/exportar/pdf", formato: "" },
} as const;

type Destino = keyof typeof DESTINOS;

export async function POST(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  try {
    const sesion = await leerSesionVigente(req);
    if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });

    let crudo: unknown;
    try {
      crudo = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    // Lista cerrada de destinos: el esquema sustituye al `as Destino` con una
    // comprobación que el compilador no puede eludir y que no acepta tipos ajenos.
    const check = enlaceDescargaSchema.safeParse(crudo);
    if (!check.success) {
      return NextResponse.json(
        { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = check.data;

    const destino = body.destino as Destino;
    if (!(destino in DESTINOS)) {
      return NextResponse.json({ error: "Destino de descarga no válido" }, { status: 400 });
    }
    const cfg = DESTINOS[destino];

    // Los filtros del administrador se reenvían a la URL firmada. Solo se aceptan los
    // nombres conocidos: cualquier otro parámetro se descarta, para que este endpoint no
    // se convierta en un generador de URLs arbitrarias (SSRF o inyección de parámetros).
    const PERMITIDOS = new Set([
      "tipo",
      "sector",
      "modalidad",
      "anioMin",
      "anioMax",
      "incluirBajas",
      "vista",
      "conDetalle",
    ]);

    const query = new URLSearchParams();
    if (cfg.formato) query.set("formato", cfg.formato);
    for (const [clave, valor] of Object.entries(body.params ?? {})) {
      if (!PERMITIDOS.has(clave)) continue;
      if (valor === undefined || valor === null || valor === "") continue;
      query.set(clave, String(valor));
    }

    const { url, exp } = firmarDescarga(cfg.ruta, String(sesion.sub));

    const completa = url + (query.size ? `&${query.toString()}` : "");

    await registrarAuditoria({
      accion: "exportar",
      entidad: "enlace_descarga",
      idUsuario: sesion.sub,
      detalles: `Enlace temporal emitido para ${destino} (caduca ${new Date(exp).toISOString()})`,
      req,
    });

    return NextResponse.json({
      url: completa,
      expiraEn: new Date(exp).toISOString(),
      // Se recuerda en la interfaz que el enlace caduca: sin esto, quien pulse
      // "descargar" dos veces seguidas chocará con un 403 sin entender por qué.
      mensaje: "El enlace caduca en 5 minutos. Si falla, vuelva a generar la descarga.",
    });
  } catch (e) {
    return errorInterno(e, "api/exportar/enlace POST");
  }
}