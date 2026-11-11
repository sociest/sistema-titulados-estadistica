import { defineConfig } from "drizzle-kit";

// Carga .env.local (y .env.<NODE_ENV>) antes de leer DATABASE_URL. Reusa el mismo módulo
// que src/db para que `pnpm db:*` y `pnpm seed` siempre hablen con la misma base.
import "./src/db/env";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL no está definido. Copie .env.example a .env y complete la variable."
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Sin valor por defecto a propósito: si falta, es mejor fallar que conectarse
    // calladamente a una base equivocada.
    url: process.env.DATABASE_URL,
  },
});