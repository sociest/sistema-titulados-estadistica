import path from "node:path";

/** Carpeta donde se guardan las imágenes subidas de noticias (dentro de storage/, persistente en Docker). */
export const DIR_IMAGENES_NOTICIAS = path.join(process.cwd(), "storage", "noticias");
