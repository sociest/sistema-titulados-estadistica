# Sistema de Seguimiento a Titulados y Egresados

Carrera de Estadística — Universidad Mayor de San Andrés.

Aplicación Next.js para registrar titulados y egresados y publicar los indicadores de
acreditación. La carpeta del proyecto es **`sistema-titulados-estadistica-main`** (antes
se llamaba `vcl2`); los comandos de este README usan ese nombre.

---

## 1. Requisitos

| Herramienta                | Versión    | Uso                                       |
| -------------------------- | ---------- | ----------------------------------------- |
| Docker + Docker Compose v2 | 24 / 2.20+ | Despliegue recomendado (app + PostgreSQL) |
| Node.js                    | 20 LTS     | Solo desarrollo con `pnpm`                |
| pnpm                       | 10+        | Solo desarrollo                           |
| PostgreSQL                 | 16         | Solo si se usa una base nativa            |
| Python                     | 3.11+      | Solo para las pruebas de calidad          |

Puertos:

| Puerto | Servicio                      | Nota                                                              |
| ------ | ----------------------------- | ----------------------------------------------------------------- |
| 3001   | App (host)                    | `APP_HOST_PORT` en `.env`                                         |
| 80     | Traefik opcional              | Solo con `--profile proxy`                                        |
| 5433   | PostgreSQL (host)             | `DB_PORT`, escucha solo en `127.0.0.1`                            |
| 3000   | Next.js dentro del contenedor | No se publica directo; en el host suele estar ocupado por Dokploy |

---

## 2. Despliegue con Docker (recomendado)

### 2.1 Archivos que deben existir antes del build

| Archivo            | ¿Obligatorio?                   | Para qué                               | Se versiona |
| ------------------ | ------------------------------- | -------------------------------------- | ----------- |
| `.env`             | Sí                              | Variables de app, BD, SMTP y URLs      | No          |
| `smtp_pass.txt`    | Sí (por el montaje del compose) | Respaldo local de la contraseña SMTP   | No          |
| `datos_prueba.csv` | No                              | Solo para `pnpm seed:masivo`           | No          |
| `storage/`         | No                              | El Dockerfile y los volúmenes lo crean | No          |
| `backups/`         | No                              | Lo crea `scripts/backup.sh`            | No          |

Si `smtp_pass.txt` no existe, Docker crea un **directorio** vacío en esa ruta y el
montaje queda inútil. Crear el archivo antes de levantar, incluso si se deja vacío:

```bash
printf '%s\n' 'CLAVE_SMTP' > smtp_pass.txt   # o: SMTP_PASS=CLAVE_SMTP
chmod 600 smtp_pass.txt
```

El archivo puede contener solo la clave o una línea `SMTP_PASS=...`; las líneas con `#`
se ignoran. `SMTP_PASS` en `.env` tiene prioridad si no empieza con `$`.

### 2.2 Pasos

```bash
cd sistema-titulados-estadistica-main

# 0. Archivos base (antes de construir)
cp .env.example .env
nano .env        # DB_PASSWORD, SESSION_SECRET, URLs, SMTP_* y Turnstile
printf '%s\n' 'CLAVE_SMTP' > smtp_pass.txt
chmod 600 .env smtp_pass.txt

# 1. Construir la imagen (los NEXT_PUBLIC_* se graban en el build)
docker compose build app

# 2. Levantar base de datos y aplicación
docker compose up -d

# 3. Verificar
docker compose ps -a
docker compose stats --no-stream          # consumo de todos los servicios
docker compose stats --no-stream app      # solo la aplicación
docker compose logs --tail=100 app
curl -sI http://localhost:3001/ | head -3
```

`docker compose stats --no-stream` imprime una foto fija y no deja la terminal
bloqueada. Alternativa equivalente en Bash/WSL:

```bash
docker stats --no-stream $(docker compose ps -q)
```

Usar esa forma solo si hay contenedores levantados: si el proyecto está apagado,
`docker compose ps -q` queda vacío y `docker stats` mostraría los contenedores de
**otros** proyectos.

Antes del build solo hacen falta `.env` y `smtp_pass.txt`. `datos_prueba.csv` se usa
después, con el sistema ya levantado, y `storage/`/`backups/` se crean solos.

Al arrancar, el contenedor:

1. Espera a que PostgreSQL responda.
2. Aplica las migraciones Drizzle (`AUTORUN_MIGRATIONS=true`).
3. Ejecuta el seed si `AUTORUN_SEED=true`. El seed **no duplica datos**: si ya hay
   personas, solo asegura la cuenta Kardex.

Acceso: `http://localhost:3001` (redirige a `/titulados`).

### 2.3 Variables obligatorias

`docker compose` no arranca si faltan:

```dotenv
DB_PASSWORD=...                 # openssl rand -hex 24
SESSION_SECRET=...              # openssl rand -hex 32
NEXT_PUBLIC_APP_URL=https://tu-dominio.umsa.bo
SITIO_URL=https://tu-dominio.umsa.bo
```

`NEXT_PUBLIC_APP_URL`, `SITIO_URL` y las claves de Turnstile se graban al **construir**.
Si cambian, hay que reconstruir (`docker compose build app`), no solo reiniciar.
En producción deben usar `https://`; de eso depende que la cookie de sesión se marque
`Secure`.

### 2.4 Volumen de la base de datos

El volumen se llama `sistitulados_postgres_data` (`PG_VOLUME_NAME` en `.env`). Si el
servidor ya tenía datos en otro volumen, apuntar `PG_VOLUME_NAME` al volumen existente
**antes** de levantar, o restaurar un respaldo. Si no coincide, se crea una base vacía.

### 2.5 Windows

Ejecutar los mismos comandos desde WSL 2 (Ubuntu). En PowerShell nativo usar `curl.exe`
y Docker Desktop; los scripts `:docker` de `package.json` requieren `sh` (WSL o Git Bash).

### 2.6 Apagado y limpieza

```bash
docker compose down        # apaga y conserva los datos
docker compose down -v     # apaga y borra volúmenes (BD + adjuntos)
```

---

## 3. Traefik opcional

Traefik está en `docker-compose.yml` con el perfil `proxy`, desactivado por defecto.
No afecta a un despliegue normal ni a Dokploy (Dokploy ya trae su propio proxy).

```bash
# App + BD + Traefik en el puerto 80
docker compose --profile proxy up -d

# Verificar
curl -sI http://localhost/ | head -3
docker compose ps
```

Con Traefik activo se puede entrar por `http://localhost` (puerto 80) o por
`http://localhost:3001`. Para desactivarlo:

```bash
docker compose --profile proxy down
```

Si el puerto 80 está ocupado, cambiar `TRAEFIK_PORT` en `.env`. En producción con
HTTPS, terminar TLS en el proxy institucional (Nginx/Traefik con certificados) y dejar
que él reenvíe a la app.

---

## 4. `smtp_pass.txt`

El envío de correo usa la contraseña SMTP definida en `.env` (`SMTP_PASS`). Además,
`docker-compose.yml` monta el archivo local `smtp_pass.txt` en `/app/smtp_pass.txt`
(solo lectura), como respaldo para el encargado del servidor.

- El archivo **no se versiona**: está en `.gitignore` y `.dockerignore`.
- Crearlo en la raíz del proyecto antes de levantar:

```bash
printf '%s\n' 'CLAVE_SMTP' > smtp_pass.txt
chmod 600 smtp_pass.txt
```

- Si no existe, Docker crea un directorio vacío en esa ruta; el sistema sigue
  funcionando con `SMTP_PASS` y el enlace queda en el log si no hay configuración.

---

## 5. Scripts disponibles

### 5.1 `package.json`

| Script                        | Qué hace                                                  |
| ----------------------------- | --------------------------------------------------------- |
| `pnpm dev`                    | Next.js en desarrollo contra la BD de `.env`              |
| `pnpm dev:docker`             | Next.js nativo + PostgreSQL del compose de desarrollo     |
| `pnpm build` / `pnpm start`   | Build y ejecución de producción nativa                    |
| `pnpm lint`                   | ESLint                                                    |
| `pnpm db:generate`            | Genera migraciones desde `src/db/schema.ts`               |
| `pnpm db:migrate`             | Aplica migraciones                                        |
| `pnpm db:migrate:docker`      | Migraciones contra la BD de `docker-compose.db.yml`       |
| `pnpm db:migrate:prod`        | Migraciones dentro del contenedor (`scripts/migrate.mjs`) |
| `pnpm db:push`                | Sincroniza el esquema sin migración (solo desarrollo)     |
| `pnpm db:studio`              | Drizzle Studio                                            |
| `pnpm seed`                   | Datos mínimos (admin, Kardex, 10 personas, noticias)      |
| `pnpm seed -- --reset`        | Borra y recarga los datos de prueba (solo desarrollo)     |
| `pnpm seed:docker`            | Seed contra la BD de desarrollo del compose               |
| `pnpm seed:masivo`            | Carga masiva desde `datos_prueba.csv`                     |
| `pnpm backup`                 | Respaldo vía `/api/respaldar` (requiere admin)            |
| `pnpm correo:probar <correo>` | Envía un correo de prueba                                 |
| `pnpm test:calidad`           | Ejecuta la suite de calidad y seguridad                   |
| `pnpm docker:proxy`           | Levanta app + BD + Traefik                                |
| `pnpm docker:reset`           | `docker compose down -v`                                  |

### 5.2 Scripts sueltos

| Archivo                    | Uso                                       |
| -------------------------- | ----------------------------------------- |
| `scripts/seed.ts`          | Seed mínimo; `--reset` solo en desarrollo |
| `scripts/seed_masivo.ts`   | Carga por lotes desde CSV                 |
| `scripts/seed_kardex.ts`   | Asegura la cuenta Kardex                  |
| `scripts/migrate.mjs`      | Aplica migraciones (lo usa el entrypoint) |
| `scripts/db-url.mjs`       | Imprime la `DATABASE_URL` de desarrollo   |
| `scripts/probar-correo.ts` | Prueba SMTP desde la terminal             |
| `scripts/backup.sh`        | Respaldo y rotación de archivos           |
| `scripts/aplicar-smtp.mjs` | Copia `smtp_pass.txt` al `.env`           |

Dentro del contenedor, los mismos comandos se ejecutan con `docker compose exec`:

```bash
docker compose exec app npx tsx scripts/seed.ts
docker compose exec app node scripts/migrate.mjs
```

---

## 6. Pruebas de calidad

La suite está en `pruebascalidad/` y **no necesita base de datos**: analiza el código,
las rutas y la configuración.

```bash
# Linux / macOS / WSL
python3 pruebascalidad/test_calidad.py
# Windows
python pruebascalidad/test_calidad.py
# o
pnpm test:calidad
```

Cubre cuatro bloques:

- **Estructura**: carpetas `app`, `components`, `db`, `lib`.
- **Seguridad**: rutas públicas con mitigación, guardas de sesión, hash de contraseñas,
  cookies, rate limit, CSRF, auditoría, SQL injection, XSS y secretos fuera del repo.
- **Calidad**: manejo de errores, TypeScript, lint, responsive, accesibilidad,
  paginación y pruebas.
- **Funcionalidad**: KPIs, exportación, importación, PDF, backups, migraciones, seed y
  módulos de admin/portal.

Resultado actual: **91/91 pruebas superadas**. El número crece cuando se agregan rutas
API nuevas (cada ruta se audita). Genera:

```
pruebascalidad/resultados.json
pruebascalidad/resultadopruebas.md
pruebascalidad/resultadopruebas.docx   (si python-docx está instalado)
```

Las rutas públicas se declaran en `RUTAS_PUBLICAS_POR_DISENO` dentro del script: si se
agrega una ruta pública, hay que documentar ahí su mitigación para que la prueba la
acepte.

---

## 7. Desarrollo con pnpm

### 7.1 App nativa + PostgreSQL en Docker

```bash
docker compose -p sistitulados-db -f docker-compose.db.yml up -d
pnpm install
pnpm dev:docker          # http://localhost:3000
```

El `-p sistitulados-db` evita que este compose pise los contenedores del compose
principal. La app usa `localhost:5433`; dentro de Docker siempre es `db:5432`.

### 7.2 Todo nativo

Configurar `DATABASE_URL` en `.env` apuntando a PostgreSQL local y ejecutar:

```bash
pnpm db:migrate
pnpm seed
pnpm dev
```

### 7.3 `.env`

`.env` es la única fuente de variables (no `.env.local`). `.env.example` solo trae
nombres y valores vacíos. Nunca subir `.env` ni `smtp_pass.txt`.

---

## 8. Dokploy

1. Crear el servicio con `docker-compose.dokploy.yml`.
2. Cargar en **Environment**: `DB_PASSWORD`, `SESSION_SECRET`, `DB_NAME`, `DB_USER`,
   `NEXT_PUBLIC_APP_URL`, `SITIO_URL`, Turnstile y SMTP.
3. Asignar el dominio al servicio `app`, puerto **3000**.
4. Hacer **Rebuild** (no solo reiniciar) cuando cambien variables `NEXT_PUBLIC_*`.

Los volúmenes `solicitudes_dokploy_storage` y `noticias_dokploy_storage` conservan los
archivos entre despliegues. No borrarlos.

---

## 9. Usuarios del seed

| Usuario         | Contraseña  | Rol    |
| --------------- | ----------- | ------ |
| `adm@gen.bo`    | `adm`       | Admin  |
| `kardex@gen.bo` | `kardex123` | Kardex |

Cambiar la contraseña del admin antes de entregar el sistema.
Titulados/egresados de ejemplo: CI `6893412` y `8341920`.

---

## 10. Copias de seguridad

`scripts/backup.sh` descarga el respaldo desde `/api/respaldar` (no usa `pg_dump`).
Necesita la app levantada y credenciales de admin:

```bash
ADMIN_CI=adm@gen.bo ADMIN_PASSWORD=adm \
APP_URL=http://localhost:3001 bash scripts/backup.sh

# Formato SQL en vez de JSON
FORMATO=sql bash scripts/backup.sh
```

Programar con `crontab -e`:

```cron
0 2 * * * cd /opt/sistema-titulados-estadistica-main && \
  ADMIN_CI=adm@gen.bo ADMIN_PASSWORD=adm APP_URL=https://tu-dominio.umsa.bo \
  bash scripts/backup.sh >> /var/log/seguit-backup.log 2>&1
```

Los respaldos quedan en `backups/` con permisos `600` y rotación de 30 días.

---

## 11. Estructura

```
sistema-titulados-estadistica-main/
├── docker-compose.yml              Producción local (app + db + Traefik opcional)
├── docker-compose.dokploy.yml      Dokploy
├── docker-compose.db.yml           Solo PostgreSQL para desarrollo
├── Dockerfile / docker-entrypoint.sh
├── drizzle/                        Migraciones versionadas
├── scripts/                        Seed, migraciones, correo, backup
├── pruebascalidad/                 Suite de calidad (91 pruebas)
├── src/
│   ├── app/                        Páginas y API Routes
│   ├── components/
│   ├── db/                         Esquema y conexión
│   ├── lib/                        Sesión, contraseñas, guardas, auditoría
│   └── middleware.ts
├── storage/                        Adjuntos (volúmenes en Docker)
├── .env.example                    Plantilla sin secretos
└── smtp_pass.txt                   Secreto local, NO versionado
```

---

## 12. Problemas frecuentes

| Síntoma                               | Causa                                               | Solución                                                                     |
| ------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Falta DB_PASSWORD en .env`           | No hay `.env` o está incompleto                     | `cp .env.example .env` y completar                                           |
| `Falta SESSION_SECRET`                | Igual                                               | Generar con `openssl rand -hex 32`                                           |
| `relation "personas" does not exist`  | Migraciones no aplicadas                            | `AUTORUN_MIGRATIONS=true` y reiniciar; o `node scripts/migrate.mjs`          |
| La app no abre en 3001                | Contenedor unhealthy                                | `docker compose logs app` y `docker compose ps`                              |
| Los enlaces de correo van a localhost | `NEXT_PUBLIC_APP_URL`/`SITIO_URL` mal o sin rebuild | Corregir y `docker compose build app`                                        |
| La sesión no persiste                 | URL en `http://` con cookie `Secure`                | Usar `https://` en producción                                                |
| `port is already allocated`           | Otro PostgreSQL/Traefik ocupa el puerto             | Cambiar `DB_PORT` o `TRAEFIK_PORT`                                           |
| `Bind for 0.0.0.0:3000 failed`        | Dokploy u otro servicio ya usa el 3000              | Publicar la app en 3001 (`APP_HOST_PORT=3001`); no detener Dokploy           |
| Se perdió la base al desplegar        | `PG_VOLUME_NAME` apunta a un volumen nuevo          | Apuntar al volumen anterior o restaurar respaldo                             |
| `permission denied` en `storage/`     | Volumen creado como root                            | Reconstruir la imagen; el Dockerfile crea los directorios con dueño `nextjs` |
