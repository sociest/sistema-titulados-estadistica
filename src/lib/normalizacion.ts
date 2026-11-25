/**
 * Utilidades compartidas de normalización y verificación de completitud
 * para altas manuales, edición e importación masiva (CSV / Excel).
 */

/**
 * Convierte texto a MAYÚSCULAS limpias preservando ñ→Ñ, vocales acentuadas
 * (á→Á, é→É, í→Í, ó→Ó, ú→Ú, ü→Ü) y apóstrofes (ej. "laleshk'a" → "LALESHK'A").
 */
export function aMayusculasLimpias(valor: string): string {
  return valor
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[’`´]/g, "'")
    .toLocaleUpperCase("es-BO");
}

/** Limpia acentos, puntos, guiones y espacios únicamente para buscar claves en diccionarios. */
function claveDiccionario(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-_/\s]+/g, "");
}

const DICCIONARIO_TIPO: Record<string, "TITULADO" | "EGRESADO"> = {
  titulado: "TITULADO",
  titulados: "TITULADO",
  titulada: "TITULADO",
  tituladas: "TITULADO",
  tit: "TITULADO",
  t: "TITULADO",
  egresado: "EGRESADO",
  egresados: "EGRESADO",
  egresada: "EGRESADO",
  egresadas: "EGRESADO",
  egr: "EGRESADO",
  e: "EGRESADO",
};

/** Normaliza el tipo de estudiante ("TITULADO" | "EGRESADO"). */
export function normalizarTipo(valor: unknown): "TITULADO" | "EGRESADO" | string {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "";
  const clave = claveDiccionario(bruto);
  return DICCIONARIO_TIPO[clave] ?? aMayusculasLimpias(bruto);
}

const DICCIONARIO_GENERO: Record<string, "MASCULINO" | "FEMENINO"> = {
  masculino: "MASCULINO",
  masculina: "MASCULINO",
  masc: "MASCULINO",
  m: "MASCULINO",
  hombre: "MASCULINO",
  varon: "MASCULINO",
  femenino: "FEMENINO",
  femenina: "FEMENINO",
  fem: "FEMENINO",
  f: "FEMENINO",
  mujer: "FEMENINO",
};

/** Normaliza el género tolerando variaciones de capitalización y abreviaturas (solo MASCULINO o FEMENINO). */
export function normalizarGenero(
  valor: unknown
): "MASCULINO" | "FEMENINO" | string {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "";
  const clave = claveDiccionario(bruto);
  if (DICCIONARIO_GENERO[clave]) return DICCIONARIO_GENERO[clave];
  if (clave.startsWith("masc")) return "MASCULINO";
  if (clave.startsWith("fem")) return "FEMENINO";
  return aMayusculasLimpias(bruto);
}

export const MODALIDADES_OFICIALES = [
  "TESIS",
  "PROYECTO DE GRADO",
  "EXAMEN DE GRADO",
  "TRABAJO DIRIGIDO",
  "EXCELENCIA",
  "OTRO",
] as const;

export type ModalidadOficial = (typeof MODALIDADES_OFICIALES)[number];

const DICCIONARIO_MODALIDAD: Record<string, ModalidadOficial> = {
  eg: "EXAMEN DE GRADO",
  exgrado: "EXAMEN DE GRADO",
  examen: "EXAMEN DE GRADO",
  examengrado: "EXAMEN DE GRADO",
  examendegrado: "EXAMEN DE GRADO",
  tg: "TRABAJO DIRIGIDO",
  td: "TRABAJO DIRIGIDO",
  trabdirigido: "TRABAJO DIRIGIDO",
  trabajodirigido: "TRABAJO DIRIGIDO",
  trabajodegrado: "TRABAJO DIRIGIDO",
  trabajogrado: "TRABAJO DIRIGIDO",
  pg: "PROYECTO DE GRADO",
  proyecto: "PROYECTO DE GRADO",
  proyectogrado: "PROYECTO DE GRADO",
  proyectodegrado: "PROYECTO DE GRADO",
  tesis: "TESIS",
  t: "TESIS",
  excelencia: "EXCELENCIA",
  exc: "EXCELENCIA",
  ex: "EXCELENCIA",
  porexcelencia: "EXCELENCIA",
  titulacionporexcelencia: "EXCELENCIA",
  excelenciaacademica: "EXCELENCIA",
  otro: "OTRO",
  otros: "OTRO",
  otra: "OTRO",
};

/**
 * Normaliza modalidades de titulación usando el diccionario canónico en MAYÚSCULAS
 * (ej. "EG", "e.g." -> "EXAMEN DE GRADO"; "TG" -> "TRABAJO DIRIGIDO"; "EXcelencia" -> "EXCELENCIA").
 */
export function normalizarModalidad(valor: unknown): ModalidadOficial | string {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "";
  const clave = claveDiccionario(bruto);
  return DICCIONARIO_MODALIDAD[clave] ?? aMayusculasLimpias(bruto);
}

/** Normaliza semestre de ingreso/egreso ("I/2016", "2018", etc.) en MAYÚSCULAS limpias. */
export function normalizarSemestre(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const bruto = String(valor).trim();
  if (!bruto) return null;
  return aMayusculasLimpias(bruto);
}

export interface PersonaCompletitud {
  tipo: string;
  genero?: string | null;
  semestreIngreso?: string | null;
  semestreEgreso?: string | null;
  anioEgreso?: number | null;
  anioTitulacion?: number | null;
  modalidadTitulacion?: string | null;
}

/**
 * Devuelve la lista legible de campos académicos/Kardex faltantes para remarcar en rojo
 * los registros que requieren actualización.
 */
export function camposFaltantesPersona(p: PersonaCompletitud): string[] {
  const faltantes: string[] = [];
  if (!p.genero || p.genero === "PREFIERO_NO_DECIR") faltantes.push("Género");
  if (!p.semestreIngreso || String(p.semestreIngreso).trim() === "") faltantes.push("Semestre ingreso");
  if (!p.semestreEgreso || String(p.semestreEgreso).trim() === "") faltantes.push("Semestre egreso");
  if (p.anioEgreso === null || p.anioEgreso === undefined) faltantes.push("Año egreso");

  if (p.tipo === "TITULADO") {
    if (p.anioTitulacion === null || p.anioTitulacion === undefined) faltantes.push("Año titulación");
    if (!p.modalidadTitulacion || String(p.modalidadTitulacion).trim() === "") {
      faltantes.push("Modalidad titulación");
    }
  }
  return faltantes;
}
