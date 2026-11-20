import "./env"; // DEBE ser el primer import: carga .env.local antes de leer DATABASE_URL
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL no está definido. Copiá .env.example a .env.local y completá la variable."
  );
}

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
    query_timeout: 20000,
  });

pool.on("error", (err) => {
  console.error("[pg-pool] Error en cliente PostgreSQL inactivo:", err.message);
});

globalForDb.conn = pool;

export const db = drizzle(pool, { schema });
export { pool };
