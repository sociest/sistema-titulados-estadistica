/**
 * Utilidades para los filtros que llegan desde la URL.
 *
 * Motivo de existir: una columna ENUM de PostgreSQL no acepta un `string` cualquiera.
 * La forma rápida de resolverlo es `valor as any`, que es lo que había en cinco rutas y
 * lo que terminaba en un 500 de PostgreSQL cuando el cliente mandaba un valor fuera de
 * rango. Aquí el valor se NORMALIZA contra la lista real de valores admitidos por la
 * columna: si no pertenece, se descarta y el filtro no se aplica, con lo que el
 * resultado siempre es un subconjunto válido en vez de un error.
 */

/** Columna de Drizzle de la que se extraen sus valores admitidos. */
type ColumnaEnum = { enumValues: readonly string[] };

/**
 * Devuelve el valor si pertenece al enumerado, o `undefined` si no.
 * Un `undefined` significa "no apliques este filtro", nunca "aplica un valor inválido".
 */
export function aValorEnum<T extends ColumnaEnum>(
  columna: T,
  valor: string | null | undefined
): T["enumValues"][number] | undefined {
  if (!valor) return undefined;
  return (columna.enumValues as readonly string[]).includes(valor)
    ? (valor as T["enumValues"][number])
    : undefined;
}

/**
 * Igual que `aValorEnum`, pero con el centinela `TODOS`/`TODAS` que usa la interfaz
 * para "sin filtro". Devuelve `undefined` en ese caso.
 */
export function aFiltroEnum<T extends ColumnaEnum>(
  columna: T,
  valor: string | null | undefined,
  sinFiltro: string = "TODOS"
): T["enumValues"][number] | undefined {
  if (!valor || valor === sinFiltro || valor === "TODAS" || valor === sinFiltro + "S") {
    return undefined;
  }
  return aValorEnum(columna, valor);
}