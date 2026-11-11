import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exigirAdmin, verificarCsrf, errorInterno } from "@/lib/guards";
import { DIR_IMAGENES_NOTICIAS } from "@/lib/imagenesNoticias";

export const dynamic = "force-dynamic";

/** Tamaño máximo de imagen: 5 MB. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Detecta el tipo REAL por sus primeros bytes (magic numbers). La extensión o el
 * Content-Type que envía el navegador no se confían.
 */
function detectarFormato(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const ascii = (i: number, n: number) => Buffer.from(b.slice(i, i + n)).toString("ascii");
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  return null;
}

/** POST /api/noticias/imagen → sube una imagen (SOLO ADMIN). Devuelve la URL interna. */
export async function POST(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;
  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  try {
    const form = await req.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File))
      return NextResponse.json({ error: "Seleccione una imagen" }, { status: 400 });
    if (archivo.size === 0)
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    if (archivo.size > MAX_BYTES)
      return NextResponse.json({ error: "La imagen supera 5 MB" }, { status: 413 });

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const formato = detectarFormato(bytes);
    if (!formato)
      return NextResponse.json({ error: "Formato no permitido: use JPG, PNG o WEBP" }, { status: 415 });

    await mkdir(DIR_IMAGENES_NOTICIAS, { recursive: true });
    const nombre = `${randomUUID()}.${formato}`;
    await writeFile(path.join(DIR_IMAGENES_NOTICIAS, nombre), bytes);

    return NextResponse.json({ url: `/api/noticias/imagen/${nombre}` }, { status: 201 });
  } catch (e: unknown) {
    return errorInterno(e, "api/noticias/imagen POST");
  }
}
