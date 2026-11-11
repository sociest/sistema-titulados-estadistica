import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { personas, verificaciones } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno, verificarCsrf } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { leerSesionDeRequest } from "@/lib/sesion";
import { revocarSesionesDePersona } from "@/lib/sesiones";
import { primerErrorZod as zodPrimerError } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * POST /api/registros/[id]   ·   decisión del administrador sobre una solicitud del alta
 * pública (D5, opción B). Solo admin.
 *
 *   body { accion: "validar" }                       → VALIDADO, entra al sistema
 *   body { accion: "rechazar", motivo: "..." }       → RECHAZADO, con su motivo
 *
 * Validar y rechazar NO son simétricos a propósito:
 *
 *   · Al RECHAZAR se exige un motivo. Es lo que permite después responder "su cédula se
 *     Rechazó por X" y, sobre todo, detectar si se están rechazando cédulas reales por un
 *     criterio equivocado.
 *   · Al RECHAZAR se cierra cualquier sesión que la persona ya tuviera abierta, porque
 *     un registro descartado no debe seguir adentro.
 *   · Al VALIDAR no se toca `fechaValidacion` con una fecha inventada: se usa la hora
 *     real del servidor.
 */

const cuerpoDecision = z
  .object({
    accion: z.enum(["validar", "rechazar"]),
    motivo: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.accion === "rechazar" && !v.motivo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivo"],
        message: "Debe indicar el motivo del rechazo",
      });
    }
  });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const n = Number(params.id);
  if (!Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = cuerpoDecision.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: zodPrimerError(parseo.error), campos: parseo.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { accion, motivo } = parseo.data;

    const filas = await db
      .select({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
        estadoRegistro: personas.estadoRegistro,
      })
      .from(personas)
      .where(eq(personas.id, n))
      .limit(1);

    if (!filas[0]) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const persona = filas[0];

    if (persona.estadoRegistro !== "PENDIENTE") {
      return NextResponse.json(
        { error: `El registro ya está en estado ${persona.estadoRegistro}` },
        { status: 409 }
      );
    }

    const esValidar = accion === "validar";

    const [actualizado] = await db
      .update(personas)
      .set(
        esValidar
          ? { estadoRegistro: "VALIDADO", fechaValidacion: new Date(), motivoRechazo: null, actualizadoEn: new Date() }
          : { estadoRegistro: "RECHAZADO", motivoRechazo: motivo!, actualizadoEn: new Date() }
      )
      .where(eq(personas.id, n))
      .returning();

    if (esValidar) {
      // Los enlaces de verificación que quedaron sin usar se anulan: si ya está
      // validado, un correo que llegue después no debe volver a "confirmar" nada.
      await db
        .update(verificaciones)
        .set({ usadaEn: new Date() })
        .where(sql`${verificaciones.idPersona} = ${n} and ${verificaciones.usadaEn} is null`);
    } else {
      await revocarSesionesDePersona(n, "Registro rechazado por la administración");
    }

    await registrarAuditoria({
      accion: esValidar ? "editar" : "eliminar",
      entidad: "personas",
      entidadId: n,
      idUsuario: (await leerSesionDeRequest(req))?.sub ?? null,
      detalles:
        (esValidar ? "Validación" : "Rechazo") +
        ` de la solicitud pública de ${persona.nombresApellidos} (CI ${persona.cedulaIdentidad})` +
        (motivo ? ` · motivo: ${motivo}` : ""),
      datosAnteriores: { estadoRegistro: persona.estadoRegistro },
      datosNuevos: { estadoRegistro: esValidar ? "VALIDADO" : "RECHAZADO" },
      req,
    });

    return NextResponse.json({
      ok: true,
      estado: esValidar ? "VALIDADO" : "RECHAZADO",
      persona: actualizado,
    });
  } catch (e) {
    return errorInterno(e, "api/registros/[id] POST");
  }
}