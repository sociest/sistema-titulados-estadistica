import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { solicitudTitulado, solicitudTituladoDocumento } from "@/db/schema";
import { leerSesionVigente } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.resolve(process.env.SOLICITUDES_STORAGE_DIR || path.join(process.cwd(), "storage", "solicitudes"));

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; documentoId: string } }
) {
  const solicitudId = Number(params.id);
  const documentoId = Number(params.documentoId);
  if (!Number.isSafeInteger(solicitudId) || solicitudId <= 0 || !Number.isSafeInteger(documentoId) || documentoId <= 0) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const sesion = await leerSesionVigente(req);
  if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });

  const [row] = await db.select({
    ci: solicitudTitulado.ci,
    nombreOriginal: solicitudTituladoDocumento.nombreOriginal,
    nombreAlmacenado: solicitudTituladoDocumento.nombreAlmacenado,
    tipoMime: solicitudTituladoDocumento.tipoMime,
  }).from(solicitudTituladoDocumento)
    .innerJoin(solicitudTitulado, eq(solicitudTitulado.id, solicitudTituladoDocumento.solicitudId))
    .where(and(
      eq(solicitudTituladoDocumento.id, documentoId),
      eq(solicitudTituladoDocumento.solicitudId, solicitudId)
    )).limit(1);

  if (!row) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  if (sesion.rol !== "admin" && sesion.rol !== "KARDEX" && sesion.ci !== row.ci) {
    return NextResponse.json({ error: "No tiene permiso para acceder a este documento" }, { status: 403 });
  }

  const filePath = path.resolve(STORAGE_DIR, row.nombreAlmacenado);
  if (path.dirname(filePath) !== STORAGE_DIR) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  const esInline = req.nextUrl.searchParams.get("inline") === "1" || row.tipoMime.startsWith("image/") || row.tipoMime === "application/pdf";
  const dispositionType = esInline ? "inline" : "attachment";

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.tipoMime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${dispositionType}; filename="documento"; filename*=UTF-8''${encodeURIComponent(row.nombreOriginal)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "El archivo no está disponible" }, { status: 404 });
  }
}