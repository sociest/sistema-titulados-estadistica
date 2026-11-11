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
  MAPA_ENLACE: "https://maps.app.goo.gl/Q4CwkJEgTZ3gCRKHA",
  MAPA_EMBED_URL:
    "https://www.google.com/maps?q=Av.+Villaz%C3%B3n+1995,+La+Paz,+Bolivia&hl=es&z=17&output=embed",
} as const;
