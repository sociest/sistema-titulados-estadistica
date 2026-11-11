import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas, auditLog } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno, verificarCsrf } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { revocarSesionesDePersona } from "@/lib/sesiones";

export const dynamic = "force-dynamic";

/**
 * /api/personas/[id]
 *   GET      → ficha por id (admin o el propio titular). Útil para la UI.
 *   PATCH    → edición por id (admin o el propio titular). Requiere la CI actual para
 *              autorizar, igual que la ruta por `?ci=`.
 *   DELETE   → baja lógica (decisión D3). Solo admin. Acepta `?motivo=` para dejar
 *              escrito el porqué, y `?reactivar=1` para deshacer una baja.
 *
 * La baja es LÓGICA: se pone `activo = false` y el registro deja de aparecer en listados
 * y métricas, pero la fila se conserva porque los titulados son evidencia de
 * acreditación. Para el borrado físico se requiere `?definitivo=1` (reservado).
 */

function idInvalido(id: string) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const malo = idInvalido(params.id);
  if (malo) return malo;

  const n = Number(params.id);
  const filas = await db.select().from(personas).where(eq(personas.id, n)).limit(1);
  if (!filas.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const sesion = await leerSesionDeRequest(req);
  const esSuyo = sesion && sesion.rol !== "admin" && sesion.ci === filas[0]!.cedulaIdentidad;
  if (sesion?.rol !== "admin" && !esSuyo) {
    return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
  }

  return NextResponse.json(filas[0]);
}

/**
 * PATCH /api/personas/[id] → edición por id.
 *
 * La CI es la llave única del registro y NO se puede cambiar por esta vía: se usa para
 * firmar las sesiones, identificar los reportes y la auditoría. Para corregir una cédula
 * equivocada hay que dar de baja el registro y crear uno nuevo, de modo que quede
 * constancia del cambio en lugar de reescribir la historia.
 *
 * El resto de campos usa EXACTAMENTE las mismas reglas que `PATCH /api/personas?ci=`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const malo = idInvalido(params.id);
  if (malo) return malo;
  const n = Number(params.id);

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const actual = await db.select().from(personas).where(eq(personas.id, n)).limit(1);
  if (!actual.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Reutiliza la lógica ya probada de la ruta por cédula, delegando en ella.
  const url = new URL(req.url);
  url.searchParams.set("ci", actual[0]!.cedulaIdentidad);

  const { PATCH: patchPorCi } = await import("../route");
  return patchPorCi(
    new NextRequest(url, {
      method: "PATCH",
      headers: req.headers,
      body: await req.text(),
    }) as never
  );
}

/**
 * DELETE /api/personas/[id]  (decisión D3: baja lógica)
 *
 * Por defecto NO borra la fila: marca `activo = false` y guarda quién lo hizo, cuándo y
 * por qué. Antes esta ruta solo ponía `estadoLaboral = null` y anteponía una etiqueta
 * `[BAJA ...]` al campo `observaciones`, lo que dejaba el registro apareciendo en todos
 * los listados y en las métricas de acreditación; los datos históricos de un egresado
 * forman parte de la evidencia y no pueden desaparecer.
 *
 * ?definitivo=1 sigue siendo el borrado físico, reservado a casos exceptional.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const malo = idInvalido(params.id);
  if (malo) return malo;

  const n = Number(params.id);
  const sesion = await leerSesionDeRequest(req);

  try {
    const filas = await db.select().from(personas).where(eq(personas.id, n)).limit(1);
    if (!filas.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const persona = filas[0]!;
    const sp = new URL(req.url).searchParams;
    const motivo = (sp.get("motivo") ?? "").trim().slice(0, 500) || null;

    // ── Reactivación ────────────────────────────────────────────────────────────
    // Es la contraoperación de la baja: una Cédula dada de baja por error, o un registro
    // pendiente de corregir, se recuperan sin perder lo ya capturado.
    if (sp.get("reactivar") === "1") {
      if (persona.activo) {
        return NextResponse.json({ error: "El registro ya está activo" }, { status: 409 });
      }

      const [reactivada] = await db
        .update(personas)
        .set({
          activo: true,
          eliminadoEn: null,
          eliminadoPor: null,
          motivoBaja: null,
          actualizadoEn: new Date(),
        })
        .where(eq(personas.id, n))
        .returning();

      await registrarAuditoria({
        accion: "editar",
        entidad: "personas",
        entidadId: n,
        idUsuario: sesion?.sub ?? null,
        detalles: `Reactivación de ${persona.nombresApellidos} (CI ${persona.cedulaIdentidad}) · baja anterior: ${persona.motivoBaja ?? "sin motivo"}`,
        datosAnteriores: {
          activo: false,
          eliminadoEn: persona.eliminadoEn,
          motivoBaja: persona.motivoBaja,
        },
        datosNuevos: { activo: true },
        req,
      });

      return NextResponse.json({ ok: true, reactivado: true, persona: reactivada });
    }

    if (!persona.activo) {
      return NextResponse.json(
        { error: "El registro ya se encuentra dado de baja" },
        { status: 409 }
      );
    }

    const definitivo = sp.get("definitivo") === "1";

    // Para proteger la evidencia de acreditación, el borrado físico exige que el
    // administrador lo pida explícitamente con ?definitivo=1, y aun así se conserva
    // la traza en `audit_log`.
    if (definitivo) {
      const usos = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.entidadId, n));
      await db.delete(personas).where(eq(personas.id, n));

      await registrarAuditoria({
        accion: "eliminar",
        entidad: "personas",
        entidadId: n,
        idUsuario: sesion?.sub ?? null,
        detalles: `BORRADO FÍSICO de ${persona.nombresApellidos} (CI ${persona.cedulaIdentidad})${motivo ? ` · motivo: ${motivo}` : ""}. Registros de auditoría previos: ${usos[0]?.n ?? 0}`,
        datosAnteriores: persona,
        req,
      });

      return NextResponse.json({ ok: true, eliminado: "definitivo" });
    }

    // Baja lógica: la fila se conserva, deja de contar en los listados y queda el rastro.
    // `eliminadoPor` guarda el id del administrador solo si el id es realmente el de un
    // usuario: `usuarios` y `personas` son tablas distintas con ids que se solapan, y
    // escribir un id de persona en la FK de usuarios rompería la baja.
    const idAdmin = sesion?.rol === "admin" ? sesion.sub : null;
    const [actualizada] = await db
      .update(personas)
      .set({
        activo: false,
        eliminadoEn: new Date(),
        eliminadoPor: idAdmin,
        motivoBaja: motivo,
        actualizadoEn: new Date(),
      })
      .where(eq(personas.id, n))
      .returning();

    // Sus sesiones abiertas se cierran también: una baja que dejara al titular dentro
    // del sistema no sería una baja.
    await revocarSesionesDePersona(persona.id, "Baja lógica del registro");

    await registrarAuditoria({
      accion: "eliminar",
      entidad: "personas",
      entidadId: n,
      idUsuario: idAdmin,
      detalles: `Baja lógica de ${persona.nombresApellidos} (CI ${persona.cedulaIdentidad})${motivo ? ` · motivo: ${motivo}` : ""}`,
      datosAnteriores: { activo: true },
      datosNuevos: { activo: false, eliminadoEn: actualizada?.eliminadoEn, motivoBaja: motivo },
      req,
    });

    return NextResponse.json({ ok: true, eliminado: "logico", persona: actualizada });
  } catch (e) {
    return errorInterno(e, "api/personas/[id] DELETE");
  }
}