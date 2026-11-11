/**
 * Lector de CSV en memoria.
 *
 * Existe aparte de `scripts/seed_masivo.ts` a propósito: ese script tiene código de nivel
 * superior que inserta 10.000 filas, así que importarlo desde una API route ejecutaría la
 * carga completa cada vez que se llama al endpoint.
 *
 * Compatible con CSV de Excel en español: comillas dobles, comas y saltos de línea dentro
 * de los campos, y BOM UTF-8 inicial.
 */
export function leerCsv(contenido: string): Record<string, string>[] {
  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]!;
    const siguiente = contenido[i + 1];

    if (enComillas) {
      if (c === '"') {
        if (siguiente === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') enComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c === "\r") {
      // se ignora: el CR de CRLF
    } else campo += c;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  if (!filas.length) return [];
  const enc = filas[0]!;
  return filas
    .slice(1)
    .filter((f) => f.some((c) => c.trim() !== ""))
    .map((f) => {
      const o: Record<string, string> = {};
      enc.forEach((nombre, i) => (o[nombre.trim()] = (f[i] ?? "").trim()));
      return o;
    });
}