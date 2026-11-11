import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DIR_IMAGENES_NOTICIAS } from "@/lib/imagenesNoticias";
import { errorInterno } from "@/lib/guards";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * GET /api/noticias/imagen/:nombre → sirve una imagen subida.
 * El nombre es un UUID generado por el servidor; se valida con regex para impedir
 * que alguien lea otros archivos con "../" (path traversal).
 */
export async function GET(_req: NextRequest, { params }: { params: { nombre: string } }) {
  const m = /^([a-f0-9-]{36})\.(jpg|png|webp)$/.exec(params.nombre);
  if (!m) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  try {
    const bytes = await readFile(path.join(DIR_IMAGENES_NOTICIAS, params.nombre));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": TIPOS[m[2]!]!,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return errorInterno(e, "api/noticias/imagen GET");
  }
}
