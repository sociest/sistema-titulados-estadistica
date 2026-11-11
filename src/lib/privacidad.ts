/**
 * Controles de privacidad aplicados ANTES de publicar o exportar datos personales.
 *
 * Referencia normativa:
 *   · ISO/IEC 27701:2025 -- clausulas 7.2/8.1, "minimizacion de datos": los datos
 *     personales se protegen con medidas apropiadas al riesgo. En este sistema el
 *     control NO es estadistico sino estructural (ver mas abajo).
 *   · ISO/IEC 27001:2022 -- A.8.11 "Data masking" y A.8.12 "Data leakage prevention":
 *     enmascarar lo sensible que se publica o exporta y evitar que escape por canales
 *     no previstos.
 *   · Ley 1405 (Bolivia) art. 5: la informacion no se revela de forma individual.
 *
 * -- MODELO DE PRIVACIDAD ADOPTADO (decision del dueno del sistema) ---------------
 *
 * NO hay umbral de corte por tamano de grupo. Las metricas publicas son conteos
 * agregados y se publican siempre, incluso cuando el grupo tiene una sola persona.
 *
 * La proteccion NO depende del tamano del grupo, sino de que las respuestas publicas
 * nunca contengan datos de identidad. El dashboard no consulta, no proyecta y no
 * devuelve NINGUNA columna identificativa (nombre, cedula, correo, telefono): solo
 * agregados. Un conteo de 1 es un dato sobre una cohorte, no sobre una persona
 * identificable, porque no hay ningun campo que permita reconstruir quien es.
 *
 * Lo que si se mantiene, y es la parte que evita el CSV/Excel injection:
 *   1. `envolverIndicador`: solo oculta un indicador cuando no hay muestra alguna
 *      (total 0 o nulo). No hay umbral k.
 *   2. `sanearCeldaExportacion` / `sanearReporte` / `sanearTextoPdf`.
 */

/**
 * Envuelve un indicador unico (una tarjeta de KPI) en el sobre que espera la
 * interfaz.
 *
 * Sin umbral k: el unico motivo para no publicar es que NO HAYA datos (total 0 o
 * null). En ese caso devuelve `metric_value: null` y `show_kpi: false`, para que la
 * interfaz oculte la tarjeta entera en vez de mostrar un 0 % engañoso.
 */
export function envolverIndicador(
  valor: number,
  totalMuestra: number
): { metric_value: number | null; total_sample: number; show_kpi: boolean } {
  const hayMuestra = typeof totalMuestra === "number" && Number.isFinite(totalMuestra) && totalMuestra > 0;
  return {
    metric_value: hayMuestra ? valor : null,
    total_sample: totalMuestra,
    show_kpi: hayMuestra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SANITIZACIÓN DE EXPORTACIONES (CSV / Excel / formula injection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Excel y LibreOffice ejecutan una celda que empieza por `=`, `+`, `-`, `@`, tab o
 * retorno como FÓRMULA. Un egresado que ponga `@SUM(...)` en "empresa actual" no
 * ataca su propia fila: el archivo se abre en el equipo del administrador y la fórmula
 * se ejecuta con SUS permisos (puede exfiltrar con `=HYPERLINK`, o lanzar comandos con
 * funciones DDE como `=cmd|' /C calc'!A0` en versiones antiguas).
 *
 * Es el vector de CSV injection, y es DLP puro: el dato sale del perímetro del sistema
 * hacia una aplicación que lo interpreta.
 *
 * El carácter inicial dangerous se antepone de un apóstrofo: Excel lo trata como
 * marca de "esto es texto" y no evalúa el resto. Se aplican también las convenciones
 * de OWASP (controlchars fuera del rango imprimible permitido).
 */

const CARACTERES_INICIO_FORMULA = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Caracteres de control que se eliminan del texto exportado.
 *
 * SIN las anclas `^`/`$`, a propósito: la expresión se usa con la bandera global, y con
 * anclas solo eliminaría el primer y el último carácter de toda la cadena. `\n` (0x0A) y
 * `\t` quedan fuera del conjunto porque un `\n` sí puede aparecer legítimamente en una
 * observación; el tabulador sí se neutraliza, más abajo, por ser un disparador de
 * fórmula en Excel.
 */
const CONTROL_POR_DEFECTO = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Neutraliza una celda para que no pueda ejecutarse como fórmula.
 *
 * No lanza ni trunca: los delimitadores de coma, punto y coma y salto de línea los
 * pone el serializador (XLSX / `json_to_sheet`), no esta función.
 */
export function sanearCeldaExportacion(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  if (typeof valor === "boolean") return valor ? "SÍ" : "NO";
  if (valor instanceof Date) return valor.toISOString();

  let texto = String(valor);

  // Caracteres de control: se eliminan TODOS, no solo el primero y el último. Un
  // `\n` interno se conserva porque un comentario legítimo puede traer saltos de línea.
  texto = texto.replace(CONTROL_POR_DEFECTO, "");

  // Si el texto (ya limpio) empieza por un disparador de fórmula, se antepone `'`.
  // Se hace UNA vez, al inicio: anteponerlo repetidamente dejaría el texto corrupto.
  const primer = texto.charAt(0);
  if (CARACTERES_INICIO_FORMULA.has(primer)) {
    texto = `'${texto}`;
  }

  return texto;
}

/**
 * Aplica `sanearCeldaExportacion` a todas las celdas de un reporte ya aplanado.
 * Devuelve un objeto nuevo: nunca muta la entrada.
 */
export function sanearReporte<T extends Record<string, unknown>>(filas: T[]): Record<string, string>[] {
  return filas.map((fila) => {
    const salida: Record<string, string> = {};
    for (const [columna, valor] of Object.entries(fila)) {
      salida[columna] = sanearCeldaExportacion(valor);
    }
    return salida;
  });
}

/** Texto plano para PDF, donde no hay fórmulas pero sí inyección de contenido. */
export function sanearTextoPdf(valor: unknown): string {
  return sanearCeldaExportacion(valor).replace(/[()[\]{}<>]/g, "");
}
