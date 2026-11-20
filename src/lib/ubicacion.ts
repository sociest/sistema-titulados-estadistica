/**
 * Ubicación de la Carrera de Estadística (usada por el Footer).
 *
 * `MAPA_EMBED_URL` es la versión incrustable (iframe) de Google Maps, buscada por
 * dirección. Si quiere fijar el pin exacto: en Google Maps → Compartir → "Incorporar
 * un mapa" → copie solo el valor de `src="…"` y péguelo aquí.
 * Recuerde que `next.config.mjs` debe permitir ese dominio en `frame-src`.
 */
export const UBICACION = {
  nombre: "Carrera de Estadística — UMSA",
  direccion: "Av. Villazón N° 1995, Monoblock Central, 2do piso",
  ciudad: "La Paz, Bolivia",
  /** Enlace corto oficial (abre la app o el sitio de Google Maps). */
  /** Monoblock Central (coordenadas exactas del enlace oficial, para que el pin aparezca). */
  MAPA_ENLACE: "https://maps.app.goo.gl/2NmA5yR83nkeG4ce6",
  MAPA_EMBED_URL:
    "https://www.google.com/maps?q=-16.504687,-68.1295342&hl=es&z=17&output=embed",
  /** Segunda ubicación: Dirección Cota Cota (coordenadas exactas del enlace oficial). */
  MAPA_ENLACE_COTA_COTA: "https://maps.app.goo.gl/fAxiS8daJgCWYfP78",
  MAPA_EMBED_URL_COTA_COTA:
    "https://www.google.com/maps?q=-16.539890487061147,-68.0678615960529&hl=es&z=17&output=embed",
} as const;
