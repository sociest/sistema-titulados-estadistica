import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noticiasCursos, type NuevaNoticiaCurso } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { exigirAdmin, errorInterno, verificarCsrf, leerSesionVigente } from "@/lib/guards";
import { registrarCambio } from "@/lib/auditoriaTablas";
import { calcularCambios } from "@/lib/diff";
import { noticiaActualizacionSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/** GET /api/noticias/:id → detalle. ?admin=1 incluye no publicadas (solo admin). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const admin = new URL(req.url).searchParams.get("admin") === "1";
  if (admin) {
    const denegado = await exigirAdmin(req);
    if (denegado) return denegado;
  }
  // El admin ve también las ocultas aunque no pida ?admin=1 (el enlace "Ver" del panel).
  const verTodas = admin || (await leerSesionVigente(req))?.rol === "admin";

  try {
    const rows = verTodas
      ? await db.select().from(noticiasCursos).where(eq(noticiasCursos.id, id)).limit(1)
      : await db
          .select()
          .from(noticiasCursos)
          .where(and(eq(noticiasCursos.id, id), eq(noticiasCursos.publicado, true)))
          .limit(1);
    if (!rows.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/[id] GET");
  }
}

const TIPOS = ["noticia_institucional", "curso_evento", "noticia_social"];
const CATEGORIAS = ["noticia", "convocatoria"];

/** PATCH /api/noticias/:id → editar (SOLO ADMIN) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // La edición acepta un subconjunto del alta, pero con las MISMAS reglas de tipo y
  // longitud. Antes cada campo se validaba a mano y un campo desconocido pasaba
  // silenciosamente; el esquema `.strict()` lo rechaza.
  const check = noticiaActualizacionSchema.safeParse(crudo);
  if (!check.success) {
    return NextResponse.json(
      { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const body = check.data as Record<string, unknown>;

  const patch: Partial<NuevaNoticiaCurso> = {};
  if (typeof body.titulo === "string") patch.titulo = body.titulo;
  if (typeof body.cuerpo === "string") patch.cuerpo = body.cuerpo;
  if (typeof body.tipo === "string") patch.tipo = body.tipo as NuevaNoticiaCurso["tipo"];
  if (typeof body.categoria === "string") patch.categoria = body.categoria as NuevaNoticiaCurso["categoria"];
  if (typeof body.fecha === "string") patch.fecha = body.fecha;
  if (body.imagenUrl !== undefined) patch.imagenUrl = String(body.imagenUrl).trim() || null;
  if (body.publicado !== undefined) patch.publicado = body.publicado === true;
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  patch.actualizadoEn = new Date();

  try {
    const antes = await db.select().from(noticiasCursos).where(eq(noticiasCursos.id, id)).limit(1);
    const [actualizada] = await db
      .update(noticiasCursos)
      .set(patch)
      .where(eq(noticiasCursos.id, id))
      .returning();

    const sesion = await leerSesionVigente(req);
    await registrarCambio({
      tabla: "audit_noticias",
      accion: "editar",
      entidadId: id,
      idUsuario: sesion?.sub ?? null,
      rol: sesion?.rol ?? null,
      anterior: antes[0] ?? null,
      nuevo: actualizada,
      cambios: calcularCambios(antes[0] as Record<string, unknown>, actualizada as Record<string, unknown>),
      req,
    });

    return NextResponse.json(actualizada);
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/[id] PATCH");
  }
}

/** DELETE /api/noticias/:id → eliminar (SOLO ADMIN) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  try {
    const antes = await db.select().from(noticiasCursos).where(eq(noticiasCursos.id, id)).limit(1);
    if (!antes.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await db.delete(noticiasCursos).where(eq(noticiasCursos.id, id));

    const sesionBaja = await leerSesionVigente(req);
    await registrarCambio({
      tabla: "audit_noticias",
      accion: "eliminar",
      entidadId: id,
      idUsuario: sesionBaja?.sub ?? null,
      rol: sesionBaja?.rol ?? null,
      anterior: antes[0] ?? null,
      nuevo: null,
      cambios: [],
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/[id] DELETE");
  }
}