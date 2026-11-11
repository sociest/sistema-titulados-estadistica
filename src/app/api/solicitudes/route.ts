import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas, solicitudTitulado, solicitudTituladoDocumento, solicitudTituladoHistorial } from "@/db/schema";
import { errorInterno, verificarCsrf } from "@/lib/guards";
import { leerSesionVigente } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ARCHIVOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const STORAGE_DIR = path.resolve(process.env.SOLICITUDES_STORAGE_DIR || path.join(process.cwd(), "storage", "solicitudes"));

type DocumentoValidado = {
  nombreOriginal: string;
  nombreAlmacenado: string;
  tipoMime: "application/pdf" | "image/png" | "image/jpeg";
  tamanoBytes: number;
  bytes: Buffer;
};

function detectarTipo(bytes: Buffer): DocumentoValidado["tipoMime"] | null {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function GET(req: NextRequest) {
  const sesion = await leerSesionVigente(req);
  if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  if (sesion.rol !== "EGRESADO") return NextResponse.json({ error: "Solo egresados pueden consultar su trámite" }, { status: 403 });

  try {
    const filas = await db.select({
      id: solicitudTitulado.id,
      fechaSolicitud: solicitudTitulado.fechaSolicitud,
      fechaRevision: solicitudTitulado.fechaRevision,
      estado: solicitudTitulado.estado,
      detalle: solicitudTitulado.detalle,
    }).from(solicitudTitulado).where(eq(solicitudTitulado.ci, sesion.ci)).orderBy(desc(solicitudTitulado.fechaSolicitud));
    return NextResponse.json(filas);
  } catch (error) {
    return errorInterno(error, "api/solicitudes GET");
  }
}

export async function POST(req: NextRequest) {
  const sesion = await leerSesionVigente(req);
  if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  if (sesion.rol !== "EGRESADO") return NextResponse.json({ error: "Solo egresados pueden enviar esta solicitud" }, { status: 403 });

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ARCHIVOS * MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "El envío supera el tamaño máximo permitido" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulario de documentos inválido" }, { status: 400 });
  }
  if (form.get("yaTeTitulado") !== "SI") {
    return NextResponse.json({ error: "Confirme que ya se tituló antes de enviar la solicitud" }, { status: 400 });
  }

  const archivos = form.getAll("documentos").filter((item): item is File => item instanceof File && item.size > 0);
  if (archivos.length < 1 || archivos.length > MAX_ARCHIVOS) {
    return NextResponse.json({ error: `Adjunte entre 1 y ${MAX_ARCHIVOS} documentos` }, { status: 400 });
  }

  const documentos: DocumentoValidado[] = [];
  for (const file of archivos) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name}: el máximo por archivo es 10 MB` }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const tipoMime = detectarTipo(bytes);
    if (!tipoMime) return NextResponse.json({ error: `${file.name}: sólo se aceptan PDF, PNG o JPEG válidos` }, { status: 415 });
    const extension = tipoMime === "application/pdf" ? "pdf" : tipoMime === "image/png" ? "png" : "jpg";
    const nombreOriginal = path.basename(file.name).replace(/[\r\n\0]/g, "_").slice(0, 255) || `documento.${extension}`;
    documentos.push({
      nombreOriginal,
      nombreAlmacenado: `${randomUUID()}.${extension}`,
      tipoMime,
      tamanoBytes: bytes.length,
      bytes,
    });
  }

  const [persona] = await db.select({ ci: personas.cedulaIdentidad }).from(personas).where(and(
    eq(personas.cedulaIdentidad, sesion.ci),
    eq(personas.tipo, "EGRESADO"),
    eq(personas.activo, true),
    eq(personas.estadoRegistro, "VALIDADO")
  )).limit(1);
  if (!persona) return NextResponse.json({ error: "No se encontró un registro activo de egresado" }, { status: 404 });

  const yaPendiente = await db.select({ id: solicitudTitulado.id }).from(solicitudTitulado).where(and(
    eq(solicitudTitulado.ci, sesion.ci),
    eq(solicitudTitulado.estado, "PENDIENTE")
  )).limit(1);
  if (yaPendiente.length) return NextResponse.json({ error: "Ya existe una solicitud pendiente" }, { status: 409 });

  const archivosGuardados: string[] = [];
  try {
    await mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
    for (const documento of documentos) {
      const destino = path.join(STORAGE_DIR, documento.nombreAlmacenado);
      await writeFile(destino, documento.bytes, { flag: "wx", mode: 0o600 });
      archivosGuardados.push(destino);
    }

    const solicitud = await db.transaction(async (tx) => {
      const [creada] = await tx.insert(solicitudTitulado).values({ ci: sesion.ci }).returning();
      await tx.insert(solicitudTituladoDocumento).values(documentos.map(({ bytes: _bytes, ...metadata }) => ({
        solicitudId: creada!.id,
        ...metadata,
      })));
      await tx.insert(solicitudTituladoHistorial).values({ solicitudId: creada!.id, ci: sesion.ci, estado: "PENDIENTE" });
      return creada!;
    });

    await registrarAuditoria({
      accion: "crear",
      entidad: "solicitudtitulado",
      entidadId: solicitud.id,
      detalles: `Solicitud de titulación enviada por CI ${sesion.ci} con ${documentos.length} documentos`,
      idUsuario: null,
      req,
    });
    return NextResponse.json({ id: solicitud.id, estado: solicitud.estado, fechaSolicitud: solicitud.fechaSolicitud }, { status: 201 });
  } catch (error) {
    await Promise.all(archivosGuardados.map((file) => unlink(file).catch(() => undefined)));
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ya existe una solicitud pendiente" }, { status: 409 });
    }
    return errorInterno(error, "api/solicitudes POST");
  }
}