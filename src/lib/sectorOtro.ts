/**
 * Validación del campo "Otro" de sector donde trabaja.
 * Reglas:
 *  - Vacío: válido (equivale a enviar solo sector = OTRO).
 *  - Con texto: debe ser una palabra/página coherente relacionada con
 *    un sector o puesto de trabajo. Devuelve un mensaje de error o null.
 */
export function validarSectorOtro(valor: string): string | null {
  const v = (valor ?? "").trim();

  if (v === "") return null;

  if (v.length < 3) return "El campo debe ser una palabra coherente (mínimo 3 letras)";

  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ&(),'.\- ]+$/.test(v))
    return "El campo solo admite letras y signos básicos (comas, guiones, paréntesis)";

  const letras = v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, "");
  if (letras.length < 2) return "El campo debe ser una palabra coherente relacionada con el sector de trabajo";

  const distintas = new Set(letras.toLowerCase().split(""));
  if (distintas.size < 2) return "El campo debe ser una palabra coherente (sin caracteres repetidos)";

  const vocales = (letras.match(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜyY]/g) || []).length;
  if (vocales === 0) return "El campo debe ser una palabra coherente (debe incluir vocales)";
  if (vocales / letras.length < 0.2) return "El campo parece no ser una palabra válida, revise la redacción";

  if (/(.)\1{2,}/.test(v)) return "El campo no puede contener caracteres repetidos de forma consecutiva";

  const genéricos = ["otro", "otros", "otra", "otras", "x", "s", "n", "no", "ns", "sector", "trabajo", "ninguno"];
  if (genéricos.includes(v.toLowerCase())) return "Escriba una descripción específica del sector o puesto de trabajo";

  return null;
}