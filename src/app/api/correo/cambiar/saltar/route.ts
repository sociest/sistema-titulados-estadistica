import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { errorInterno, leerSesionVigente } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Pospone el cambio obligatorio de CI a correo. Opera SOLO sobre la persona de la sesión
 * (antes aceptaba cualquier CI sin autenticación, y cualquiera podía agotar los saltos de
 * otra persona y forzarle el cambio). El descuento es atómico: no hay carrera entre dos
 * peticiones simultáneas.
 */
export async function POST(req: NextRequest) {
  try {
    const sesion = await leerSesionVigente(req);
    if (!sesion || (sesion.rol !== "TITULADO" && sesion.rol !== "EGRESADO")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const actualizado = await db
      .update(personas)
      .set({
        cambiosCorreoRestantes: sql`${personas.cambiosCorreoRestantes} - 1`,
        actualizadoEn: new Date(),
      })
      .where(
        and(
          eq(personas.id, sesion.sub),
          eq(personas.correoObligatorio, false),
          gt(personas.cambiosCorreoRestantes, 0)
        )
      )
      .returning({ restantes: personas.cambiosCorreoRestantes });

    if (!actualizado.length) {
      return NextResponse.json(
        { error: "No puede saltar más; el cambio de correo es obligatorio" },
        { status: 403 }
      );
    }
    const restantes = actualizado[0]!.restantes;
    return NextResponse.json({
      success: true,
      cambiosCorreoRestantes: restantes,
      mensaje: `Salto registrado. Le quedan ${restantes} cambio(s).`,
    });
  } catch (e) {
    return errorInterno(e, "correo/cambiar/saltar");
  }
}