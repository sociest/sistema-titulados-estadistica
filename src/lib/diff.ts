/** Un campo que cambió: valor antes y después. */
export interface CambioCampo {
  campo: string;
  antes: unknown;
  despues: unknown;
}

/** null, undefined y "" son el mismo "sin dato": cambiar entre ellos no es un cambio. */
function normalizar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" ? v.trim() : JSON.stringify(v);
}

/**
 * Compara dos registros campo a campo y devuelve solo lo que cambió.
 * Ignora columnas técnicas (marcas de tiempo) para que no aparezcan como "cambio".
 */
export function calcularCambios(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown>,
  ignorar: string[] = ["actualizadoEn", "creadoEn", "id"]
): CambioCampo[] {
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues)]);
  const cambios: CambioCampo[] = [];
  campos.forEach((campo) => {
    if (ignorar.includes(campo)) return;
    const a = antes?.[campo];
    const d = despues[campo];
    if (normalizar(a) !== normalizar(d)) cambios.push({ campo, antes: a ?? null, despues: d ?? null });
  });
  return cambios;
}
