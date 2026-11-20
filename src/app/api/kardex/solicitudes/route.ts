import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { personas, solicitudTitulado, solicitudTituladoDocumento, solicitudTituladoHistorial } from "@/db/schema";
import { errorInterno, exigirKardex, leerSesionVigente, verificarCsrf } from "@/lib/guards";
import { ipDesde, registrarAuditoria } from "@/lib/auditoria";
import { enviarCorreoTitulado } from "@/lib/correo";
import { revocarSesionesDePersona } from "@/lib/sesiones";
import { invalidarCacheDashboard } from "@/lib/cacheDashboard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denegado = await exigirKardex(req);
  if (denegado) return denegado;
  try {
    const pendientes = await db.select({
      id: solicitudTitulado.id,
      ci: solicitudTitulado.ci,
      fechaSolicitud: solicitudTitulado.fechaSolicitud,
      nombreSolicitante: personas.nombresApellidos,
    }).from(solicitudTitulado)
      .innerJoin(personas, eq(personas.cedulaIdentidad, solicitudTitulado.ci))
      .where(eq(solicitudTitulado.estado, "PENDIENTE"))
      .orderBy(desc(solicitudTitulado.fechaSolicitud));
    const ids = pendientes.map((solicitud) => solicitud.id);
    const documentos = ids.length
      ? await db.select().from(solicitudTituladoDocumento).where(inArray(solicitudTituladoDocumento.solicitudId, ids))
      : [];
    return NextResponse.json(pendientes.map((solicitud) => ({
      ...solicitud,
      documentos: documentos.filter((documento) => documento.solicitudId === solicitud.id),
    })));
  } catch (error) {
    return errorInterno(error, "api/kardex/solicitudes GET");
  }
}

const decisionSchema = z.object({
  id: z.number().int().positive(),
  estado: z.enum(["ACEPTADO", "RECHAZADO"]),
  detalle: z.string().trim().max(4000).optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const denegado = await exigirKardex(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  const detalle = parsed.data.detalle?.trim() || null;
  if (parsed.data.estado === "RECHAZADO" && !detalle) {
    return NextResponse.json({ error: "El motivo es obligatorio para rechazar la solicitud" }, { status: 400 });
  }

  const sesion = await leerSesionVigente(req);
  if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  try {
    let personaPromovida: { id: number; correo: string | null; nombre: string } | null = null;

    const actualizada = await db.transaction(async (tx) => {
      const ahora = new Date();
      const [row] = await tx.update(solicitudTitulado).set({
        estado: parsed.data.estado,
        fechaRevision: ahora,
        ipMaquinaAprobo: ipDesde(req),
        nombre: sesion.nombre || "USUARIO KARDEX",
        detalle,
      }).where(and(
        eq(solicitudTitulado.id, parsed.data.id),
        eq(solicitudTitulado.estado, "PENDIENTE")
      )).returning();
      if (!row) return null;
      await tx.insert(solicitudTituladoHistorial).values({
        solicitudId: row.id,
        ci: row.ci,
        estado: row.estado,
        fecha: row.fechaRevision!,
        nombre: row.nombre,
        ip: row.ipMaquinaAprobo,
        detalle: row.detalle,
      });

      // Cuando Kardex acepta la solicitud, el egresado pasa a TITULADO atómicamente.
      if (row.estado === "ACEPTADO") {
        const [promovida] = await tx
          .update(personas)
          .set({
            tipo: "TITULADO",
            estadoRegistro: "VALIDADO",
            fechaValidacion: ahora,
            planeaTitularse: null,
            inicioProcesoTitulacion: null,
            motivoNoTitulacion: null,
            actualizadoEn: ahora,
          })
          .where(eq(personas.cedulaIdentidad, row.ci))
          .returning({
            id: personas.id,
            correo: personas.correoElectronico,
            nombre: personas.nombresApellidos,
          });
        personaPromovida = promovida ?? null;
      }

      return row;
    });

    if (!actualizada) return NextResponse.json({ error: "La solicitud ya fue revisada o no existe" }, { status: 409 });

    if (actualizada.estado === "ACEPTADO") {
      invalidarCacheDashboard();
      const info = personaPromovida as { id: number; correo: string | null; nombre: string } | null;
      if (info?.id) {
        // Revocar sesiones con rol EGRESADO obsoleto para que reingrese como TITULADO.
        await revocarSesionesDePersona(info.id, "Promoción aprobada de EGRESADO a TITULADO");
      }
      if (info?.correo) {
        await enviarCorreoTitulado({ destino: info.correo, nombre: info.nombre }).catch((e) =>
          console.error("[kardex] aviso de titulación no enviado:", e instanceof Error ? e.message : e)
        );
      }
    }

    await registrarAuditoria({
      accion: "editar",
      entidad: "solicitudtitulado",
      entidadId: actualizada.id,
      idUsuario: sesion.sub,
      detalles: `Solicitud ${actualizada.estado} para CI ${actualizada.ci}`,
      req,
    });
    return NextResponse.json(actualizada);
  } catch (error) {
    return errorInterno(error, "api/kardex/solicitudes PATCH");
  }
}