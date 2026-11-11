import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { carreras } from "@/db/schema";
import { exigirAdminOContacto, errorInterno, verificarCsrf } from "@/lib/guards";
import { leerSesionVigente } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

const ciValido = /^[0-9]{4,12}$/;
const listaCarrerasSchema = z.array(z.object({
  carrera: z.string().trim().max(200).optional().nullable(),
  universidad: z.string().trim().max(200).optional().nullable(),
  facultad: z.string().trim().max(200).optional().nullable(),
  grados: z.string().trim().max(200).optional().nullable(),
}).strict()).max(20);

async function validarAcceso(req: NextRequest, ci: string) {
  const denegado = await exigirAdminOContacto(req, ci);
  if (denegado) return denegado;
  const sesion = await leerSesionVigente(req);
  if (sesion?.rol !== "admin" && sesion?.rol !== "TITULADO") {
    return NextResponse.json({ error: "Solo el titulado puede gestionar sus carreras" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ci = req.nextUrl.searchParams.get("ci")?.trim() ?? "";
  if (!ciValido.test(ci)) return NextResponse.json({ error: "CI numérico requerido" }, { status: 400 });
  const denegado = await validarAcceso(req, ci);
  if (denegado) return denegado;

  try {
    const filas = await db.select().from(carreras).where(eq(carreras.ci, ci)).orderBy(carreras.id);
    return NextResponse.json(filas);
  } catch (error) {
    return errorInterno(error, "api/carreras GET");
  }
}

export async function PUT(req: NextRequest) {
  const ci = req.nextUrl.searchParams.get("ci")?.trim() ?? "";
  if (!ciValido.test(ci)) return NextResponse.json({ error: "CI numérico requerido" }, { status: 400 });
  const denegado = await validarAcceso(req, ci);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = z.object({ carreras: listaCarrerasSchema }).strict().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Lista de carreras inválida" }, { status: 400 });
  const filas = parsed.data.carreras.map((row) => ({
    ci,
    carrera: row.carrera?.trim() || null,
    universidad: row.universidad?.trim() || null,
    facultad: row.facultad?.trim() || null,
    grados: row.grados?.trim() || null,
  })).filter((row) => row.carrera || row.universidad || row.facultad || row.grados);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(carreras).where(eq(carreras.ci, ci));
      if (filas.length) await tx.insert(carreras).values(filas);
    });
    const sesion = await leerSesionVigente(req);
    await registrarAuditoria({
      accion: "editar",
      entidad: "carreras",
      detalles: `Carreras adicionales actualizadas para CI ${ci} (${filas.length})`,
      idUsuario: sesion?.rol === "admin" ? sesion.sub : null,
      req,
    });
    return NextResponse.json({ carreras: filas });
  } catch (error) {
    return errorInterno(error, "api/carreras PUT");
  }
}