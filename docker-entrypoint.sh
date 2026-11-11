#!/bin/sh
set -e

# ==============================================================================
# Script de Entrada (Entrypoint) para Despliegues Docker y Dokploy
# ==============================================================================

# Si se proporciona DATABASE_URL, esperar a que PostgreSQL responda
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Verificando conectividad con PostgreSQL..."
  
  node -e '
    const pg = require("pg");
    const connectionString = process.env.DATABASE_URL;
    const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 4000 });

    async function waitDb(maxAttempts = 20) {
      for (let i = 1; i <= maxAttempts; i++) {
        try {
          const client = await pool.connect();
          await client.query("SELECT 1;");
          client.release();
          console.log("[entrypoint] ✓ Conexión con PostgreSQL exitosa.");
          await pool.end();
          process.exit(0);
        } catch (err) {
          console.log(`[entrypoint] Esperando base de datos (${i}/${maxAttempts})... (${err.message})`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      console.error("[entrypoint] ✗ Error crítico: tiempo de espera agotado conectando a PostgreSQL.");
      await pool.end();
      process.exit(1);
    }
    waitDb();
  ' || exit 1

  # Ejecución automática de migraciones (por defecto activa, desactivable con AUTORUN_MIGRATIONS=false)
  if [ "$AUTORUN_MIGRATIONS" != "false" ]; then
    echo "[entrypoint] Ejecutando migraciones automáticas Drizzle..."
    node scripts/migrate.mjs || {
      echo "[entrypoint] ✗ Error al ejecutar las migraciones."
      exit 1
    }
  else
    echo "[entrypoint] AUTORUN_MIGRATIONS=false: omitiendo migraciones automáticas."
  fi

  # Ejecución de seed inicial si se solicita explícitamente con AUTORUN_SEED=true
  if [ "$AUTORUN_SEED" = "true" ]; then
    echo "[entrypoint] AUTORUN_SEED=true: ejecutando seed inicial..."
    npx tsx scripts/seed.ts || echo "[entrypoint] Aviso: seed finalizó con advertencias."
  fi
fi

# Ejecutar el comando del contenedor (Next.js por defecto)
exec "$@"
