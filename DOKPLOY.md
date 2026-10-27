# Guía de Despliegue en Dokploy

Este documento describe la arquitectura y los pasos para desplegar el **Sistema de Seguimiento a Titulados** en un servidor administrado con **Dokploy**.

---

## 1. Consideraciones Clave para Dokploy

1. **Proxy Inverso (Traefik):**
   - Dokploy ya ejecuta y gestiona su propia instancia de Traefik en los puertos `80` y `443` con gestión automática de certificados SSL (Let's Encrypt).
   - El archivo `docker-compose.yml` original incluía un proxy Traefik que intentaba escuchar en el puerto `80`, lo que provocaba un conflicto crítico de puertos (`port 80 already allocated`).
   - El proxy embebido ahora está aislado bajo el perfil `--profile proxy` para pruebas locales aisladas, y se ha creado [docker-compose.dokploy.yml](file:///home/andreschirinos/Proyectos/WebSistemaTitulados_Est/docker-compose.dokploy.yml) diseñado específicamente para Dokploy.

2. **Migraciones Automáticas y Seed:**
   - En Dokploy el despliegue es desatendido (CI/CD).
   - Se añadió [docker-entrypoint.sh](file:///home/andreschirinos/Proyectos/WebSistemaTitulados_Est/docker-entrypoint.sh) y [scripts/migrate.mjs](file:///home/andreschirinos/Proyectos/WebSistemaTitulados_Est/scripts/migrate.mjs) para:
     - Esperar a que PostgreSQL esté disponible.
     - Aplicar automáticamente las migraciones Drizzle (`AUTORUN_MIGRATIONS=true`).
     - Insertar el administrador inicial y datos base (`AUTORUN_SEED=true`).

---

## 2. Modalidades de Despliegue en Dokploy

Existen dos maneras estándar de desplegar la aplicación en Dokploy:

### Opción A: Modo Compose (Recomendada si deseas PostgreSQL en el mismo stack)

1. En el panel de Dokploy, ve a tu proyecto y selecciona **Create Service** -> **Compose**.
2. Asigna un nombre (ej. `sistema-titulados`).
3. En la pestaña **Source**, selecciona tu repositorio de GitHub o Git.
4. En **Compose Path**, indica:
   ```text
   docker-compose.dokploy.yml
   ```
5. En la pestaña **Environment**, copia las variables de `.env.example` y define valores seguros:
   ```env
   NODE_ENV=production
   DB_USER=seguit_app
   DB_PASSWORD=DEFINIR_CLAVE_SEGURA_AQUI
   DB_NAME=sistitulados_db
   SESSION_SECRET=DEFINIR_HEX_DE_64_CARACTERES
   NEXT_PUBLIC_APP_URL=https://tu-dominio.umsa.bo
   SITIO_URL=https://tu-dominio.umsa.bo
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=tu_sitekey_cloudflare
   TURNSTILE_SECRET_KEY=tu_secret_cloudflare
   AUTORUN_MIGRATIONS=true
   AUTORUN_SEED=true
   ```
6. En la pestaña **Domains**, agrega tu dominio (ej. `titulados.umsa.bo`):
   - **Service:** `app`
   - **Port:** `3000`
   - **Certificate:** Let's Encrypt
7. Haz clic en **Deploy**.

---

### Opción B: Modo Aplicación + Base de Datos Gestionada de Dokploy

1. **Crear Base de Datos en Dokploy:**
   - Selecciona **Create Service** -> **Database** -> **PostgreSQL**.
   - Nombre: `titulados-postgres`.
   - Dokploy generará un usuario, contraseña y la cadena de conexión interna (`DATABASE_URL`).

2. **Crear la Aplicación Web:**
   - Selecciona **Create Service** -> **Application**.
   - **Build Type:** Dockerfile.
   - En **Environment**, agrega:
     ```env
     NODE_ENV=production
     DATABASE_URL=postgresql://postgres:password@titulados-postgres:5432/postgres
     SESSION_SECRET=DEFINIR_HEX_DE_64_CARACTERES
     NEXT_PUBLIC_APP_URL=https://tu-dominio.umsa.bo
     SITIO_URL=https://tu-dominio.umsa.bo
     NEXT_PUBLIC_TURNSTILE_SITE_KEY=tu_sitekey_cloudflare
     TURNSTILE_SECRET_KEY=tu_secret_cloudflare
     AUTORUN_MIGRATIONS=true
     AUTORUN_SEED=true
     PORT=3000
     ```
   - En **Domains**, asigna tu dominio apuntando al puerto `3000`.
   - Haz clic en **Deploy**.

---

## 3. Verificación Post-Despliegue

- **Logs del contenedor:** En la pestaña **Logs** de Dokploy verás:
  ```text
  [entrypoint] Verificando conectividad con PostgreSQL...
  [entrypoint] ✓ Conexión con PostgreSQL exitosa.
  [entrypoint] Ejecutando migraciones automáticas Drizzle...
  [migrate] ✓ Migraciones aplicadas con éxito.
  [entrypoint] AUTORUN_SEED=true: ejecutando seed inicial...
  ✓ Ready in ...ms
  ```
- **Credenciales iniciales generadas por el seed:**
  - **Administrador:** `adm@gen.bo` / `adm` (cambiar contraseña inmediatamente desde el panel).
  - **Kardex:** `kardex@umsa.bo` (la contraseña generada se imprime en los logs del primer arranque).
