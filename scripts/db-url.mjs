/**
 * Resuelve el DATABASE_URL para el escenario 2 (app con pnpm + BD en Docker).
 *
 * Por qué existe: cuando la app corre en el host y la base en un contenedor, el host
 * `db` no existe (solo resuelve dentro de la red de Docker) y hay que apuntar a
 * `localhost` + el puerto publicado. Editar `.env.local` a mano cada vez que se cambia
 * de escenario es la fuente clásica de "funciona pero apunta a la BD equivocada".
 *
 * Las credenciales salen de `.env`, el mismo archivo que lee `docker compose` para
 * inicializar el servicio `db`, así que no pueden desincronizarse.
 *
 * Imprime SOLO la URL por stdout (y un aviso por stderr), pensado para inyectarse:
 *   export DATABASE_URL=$(node scripts/db-url.mjs)
 *
 * O directamente con pnpm, que ya lo hace por vos:  pnpm dev:docker
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Lee `CLAVE=valor` de un archivo .env. Devuelve undefined si no está. */
function leerEnv(ruta, clave) {
  if (!fs.existsSync(ruta)) return undefined;
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === clave) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

// Mismos defaults que docker-compose.yml.
const compose = fs.readFileSync(path.join(raiz, "docker-compose.yml"), "utf8");
const valorCompose = (clave, porDefecto) => {
  const m = compose.match(new RegExp(`\\$\\{${clave}(?::-|:-)([^}]*)\\}`));
  return m ? m[1].trim() : porDefecto;
};

// Usuario y nombre de BD no son secretos: .env manda y el compose aporta el valor por defecto.
// La contraseña NO tiene valor por defecto: tiene que estar en .env (cp .env.example .env).
const delEnv = (clave) =>
  leerEnv(path.join(raiz, ".env"), clave) || leerEnv(path.join(raiz, ".env.local"), clave);

const user = delEnv("DB_USER") || valorCompose("DB_USER", "seguit_app");
const password = delEnv("DB_PASSWORD");
const dbName = delEnv("DB_NAME") || valorCompose("DB_NAME", "sistitulados_db");

if (!password) {
  console.error("[db-url] Falta DB_PASSWORD en .env. Copie .env.example a .env y complete la contraseña.");
  process.exit(1);
}

// El puerto publicado es el que está en `.env` (DB_PORT), no el 5432 interno del contenedor.
const puerto =
  leerEnv(path.join(raiz, ".env"), "DB_PORT") ||
  leerEnv(path.join(raiz, ".env.local"), "DB_PORT") ||
  "5433";

const url = `postgresql://${user}:${password}@localhost:${puerto}/${dbName}`;

// A stdout va SOLO la URL: el valor se inyecta con `$(...)`, que no evalúa
// `export` y lo tomaría literal como parte de la contraseña. El mensaje para la
// persona va a stderr, que `$(...)` descarta.
console.error(`[db-url] Escenario 2 (app pnpm + BD Docker) -> localhost:${puerto}/${dbName}`);
process.stdout.write(`${url}\n`);
