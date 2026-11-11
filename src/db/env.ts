/**
 * Carga de variables de entorno para todo lo que use la base de datos.
 *
 * Next.js ya carga `.env.local` solo, pero los scripts de `scripts/` corren con `tsx`
 * pelado, sin nadie que lea ese archivo. Peor: en ESM los `import` se evalúan antes que
 * cualquier instrucción del archivo, así que un `dotenv.config()` escrito en el cuerpo de
 * `scripts/seed.ts` corría TARDÍ — cuando `src/db/index.ts` ya había armado el Pool con
 * `DATABASE_URL` en `undefined` y se caía al valor por defecto.
 *
 * Por eso la carga vive acá, en un módulo propio: `src/db/index.ts` lo importa como
 * primera línea, y el orden de imports de ESM garantiza que quede listo antes de crear
 * el Pool.
 *
 * `override: false` (el default) hace que una variable ya presente en el entorno real
 * gane siempre: en producción lo que manda es el `pm2`/systemd, no el archivo.
 */

import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

const raiz = process.cwd();

// Orden de prioridad: .env.local > .env.<NODE_ENV> > .env (la plantilla es `.env.example`).
for (const archivo of [".env.local", `.env.${process.env.NODE_ENV || "development"}`, ".env"]) {
  const ruta = path.join(raiz, archivo);

  // Los `.env*` son opcionales: si no está el archivo, no pasa nada.
  if (!fs.existsSync(ruta)) continue;

  dotenv.config({ path: ruta });
}