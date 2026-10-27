import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, "..");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[migrate] Error: DATABASE_URL no está configurada.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10000,
});
const db = drizzle(pool);

console.log("[migrate] Aplicando migraciones Drizzle...");
try {
  await migrate(db, { migrationsFolder: path.join(raiz, "drizzle") });
  console.log("[migrate] ✓ Migraciones aplicadas con éxito.");
} catch (error) {
  console.error("[migrate] ✗ Error aplicando migraciones:", error);
  process.exit(1);
} finally {
  await pool.end();
}
