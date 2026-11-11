/**
 * Agrupación de la distribución por sector laboral.
 *
 * El enum de la base (src/db/schema.ts) solo tiene cinco valores: PUBLICO, PRIVADO, ACADEMICO,
 * ONG y OTRO. Cuando alguien marca OTRO escribe el sector real en el campo de texto libre
 * `sector_trabajo_otro`, y src/app/api/dashboard/route.ts lo devuelve tal cual como categoría
 * propia (ver exprSector). Con datos reales eso produce más de una docena de rebanadas: el
 * texto libre, los registros marcados OTRO sin descripción y los que no tienen sector.
 *
 * Un donut con esa cantidad de categorías no es legible (las etiquetas se pisan y se salen del
 * borde), así que el gráfico principal muestra solo las cuatro categorías principales más un
 * agregado "Otro". El detalle de ese agregado queda a un clic, en el modal de drill-down.
 */

export interface SectorSerie {
  key: string;
  name: string;
  valor: number;
}

/** Las cuatro categorías que se muestran directamente en el donut principal. */
export const CLAVES_PRINCIPALES = ["PUBLICO", "PRIVADO", "ACADEMICO", "ONG"] as const;

export const ETIQUETAS_SECTOR: Record<string, string> = {
  PUBLICO: "Público",
  PRIVADO: "Privado",
  ACADEMICO: "Académico / Investigación",
  ONG: "ONG / Fundaciones",
  OTRO: "Otro",
};

const PRINCIPALES = new Set<string>(CLAVES_PRINCIPALES);

/** Color fijo por categoría principal, para que no cambie al filtrar o reordenar. */
const COLOR_POR_CLAVE: Record<string, string> = {
  PUBLICO: "#1e3a8a",
  PRIVADO: "#059669",
  ACADEMICO: "#d97706",
  ONG: "#7c3aed",
  OTRO: "#64748b",
};

/** Paleta amplia para el desglose del modal, que puede llevar más de diez categorías. */
const PALETA_DETALLE = [
  "#0891b2",
  "#dc2626",
  "#0d9488",
  "#be185d",
  "#4b5563",
  "#4338ca",
  "#b45309",
  "#0369a1",
  "#65a30d",
  "#9333ea",
  "#7c2d12",
  "#0f766e",
];

/** Categoría que absorbe los registros sin sector real. */
export const CLAVE_SIN_ESPECIFICAR = "SIN_ESPECIFICAR";
const ETIQUETA_SIN_ESPECIFICAR = "Sin Especificar";

/** Subtítulo del gráfico: refleja las categorías que el donut realmente muestra. */
export const SUBTITULO_SECTOR =
  "Público, Privado, Académico / Investigación, ONG / Fundaciones y Otros";

export function esSectorPrincipal(key: string): boolean {
  return PRINCIPALES.has(key);
}

/**
 * Donut principal: las cuatro principales que tengan datos, más el agregado "Otro" con todo
 * lo que no es una de ellas (texto libre, "OTRO" sin descripción y "Sin Especificar").
 */
export function agruparPorSectorPrincipal(series: SectorSerie[]): SectorSerie[] {
  const total = new Map<string, number>();
  for (const s of series) {
    const clave = PRINCIPALES.has(s.key) ? s.key : "OTRO";
    total.set(clave, (total.get(clave) ?? 0) + (s.valor ?? 0));
  }
  const principales = CLAVES_PRINCIPALES.map((key) => ({
    key,
    name: ETIQUETAS_SECTOR[key],
    valor: total.get(key) ?? 0,
  })).filter((s) => s.valor > 0);
  const otro = total.get("OTRO") ?? 0;
  return otro > 0
    ? [...principales, { key: "OTRO", name: ETIQUETAS_SECTOR.OTRO, valor: otro }]
    : principales;
}

/**
 * Detalle del agregado "Otros": cada sector real distinto, de mayor a menor.
 *
 * Ni "OTRO" sin descripción ni los registros sin sector pueden aparecer como categoría propia:
 * dentro del desglose no puede haber una categoría que se llame "Otro", porque es el mismo grupo
 * que la contiene. Los dos casos se funden en una sola fila "Sin Especificar".
 */
export function subcategoriasDeOtro(series: SectorSerie[]): SectorSerie[] {
  const sinEspecificar = {
    key: CLAVE_SIN_ESPECIFICAR,
    name: ETIQUETA_SIN_ESPECIFICAR,
    valor: 0,
  };
  const otras: SectorSerie[] = [];
  for (const s of series) {
    if (PRINCIPALES.has(s.key) || (s.valor ?? 0) <= 0) continue;
    if (s.key === "OTRO" || s.key === "NO_ESPECIFICADO") {
      sinEspecificar.valor += s.valor;
      continue;
    }
    otras.push(s);
  }
  if (sinEspecificar.valor > 0) otras.push(sinEspecificar);
  return otras.sort((a, b) => b.valor - a.valor);
}

/** Hay drill-down solo si "Otro" realmente trae más de una categoría o una sola sin desglosar. */
export function tieneDetalleOtro(series: SectorSerie[]): boolean {
  return subcategoriasDeOtro(series).length > 0;
}

export function colorSectorPrincipal(key: string): string {
  return COLOR_POR_CLAVE[key] ?? COLOR_POR_CLAVE.OTRO;
}

export function colorSubcategoria(indice: number): string {
  return PALETA_DETALLE[indice % PALETA_DETALLE.length];
}

export function porcentaje(valor: number, total: number): string {
  if (!total) return "0%";
  return `${((valor / total) * 100).toFixed(valor / total < 0.01 ? 1 : 0)}%`;
}