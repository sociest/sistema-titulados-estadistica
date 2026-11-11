# Sistema de Seguimiento a Titulados y Egresados

### Carrera de Estadística — Universidad Mayor de San Andrés

Aplicación web para registrar y mantener actualizada la información de titulados y egresados,
y generar los indicadores consolidados que la carrera presenta ante la comisión de evaluación
externa de acreditación.

---

## 1. Requisitos previos

### 1.1 Herramientas

| Herramienta       | Versión       | Para qué                              | ¿Obligatoria?              |
| ----------------- | ------------- | ------------------------------------- | -------------------------- |
| Node.js           | **20 LTS**    | Runtime de la aplicación              | Sí (o 18.17+)              |
| pnpm              | 10 o superior | Gestor de paquetes                    | Sí                         |
| PostgreSQL        | **16**        | Base de datos                         | Sí (por Docker o nativo)   |
| Docker Compose v2 | 2.20+         | Orquestación del `docker-compose.yml` | No, si usás el escenario 4 |
| Opcional          |               |                                       |                            |
| Docker            | 24 o superior | Solo para los escenarios 2 y 3        | No, si usás el escenario 4 |

```bash
node --version     # v20.x
pnpm --version     # 10.x o superior
psql --version     # PostgreSQL 16.x        (solo escenario 4)
docker compose version   # v2.20+             (solo escenarios 2 y 3)
```

> **Node 22 puede funcionar**, pero la imagen de Docker usa `node:20-alpine`. Si `pnpm install`
> falla por scripts de compilación, revisá `.npmrc` y `pnpm-workspace.yaml`, que ya
> declaran `onlyBuiltDependencies: [esbuild, unrs-resolver]` para pnpm 10+.

### 1.2 Permisos de Docker (solo Linux, escenarios 2 y 3 Sin docker compose total)

Tu usuario debe poder hablar con el socket de Docker, o cada comando te va a fallar con
`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`:

```bash
sudo usermod -aG docker $USER
newgrp docker            # o cerrá y volvé a iniciar sesión
docker ps                # debe listar sin error
```

### 1.3 Puertos que usa el sistema

| Puerto | Quién lo usa               | Nota                                          |
| ------ | -------------------------- | --------------------------------------------- |
| 3000   | Next.js                    | La aplicación                                 |
| 80     | Traefik                    | Solo escenario 2 (todo en Docker)             |
| 5433   | PostgreSQL en Docker       | Puerto **en el host**, ver `.env` (`DB_PORT`) |
| 5432   | PostgreSQL nativo del host | Solo escenario 4                              |

> **Por qué `5433` y no `5432`:** si tenés un PostgreSQL nativo escuchando en `localhost:5432`
> (común en Ubuntu/Debian), el contenedor no puede publicar ahí. Por eso `.env` trae
> `DB_PORT=5433`. **Dentro** de la red de Docker la app siempre talks a `db:5432`.

---

## 2. Escenario 1 — Todo con Docker Compose (app + BD + proxy)

El sistema completo orquestado con Docker Compose. Es el camino más reproducible y el
recomendado para producción. No necesitás Node ni PostgreSQL instalados en el host.

**Arquitectura:**

- **Proxy inverso:** Traefik (`traefik:v2.11`) escuchando en el puerto `80` y aplicando
  headers de seguridad (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `X-XSS-Protection`, `Referrer-Policy`).
- **Aplicación web:** Next.js 14 en `node:20-alpine`, ejecutándose como el usuario no
  privilegiado `nextjs` (UID 1001). Expuesta en `3000`.
- **Base de datos:** PostgreSQL 16 Alpine con persistencia en el volumen `postgres_data`.
- **Límites de RAM:** 1 GB para `app` y `db`, 256 MB para `traefik`. Escalable en
  producción a 2.5–3 GB modificando `deploy.resources.limits.memory`.

### 2.1 Linux (Ubuntu/Debian)

```bash
cd sistema1_5

# 1. Crear tu .env a partir de la plantilla (la plantilla NO tiene datos reales)
cp .env.example .env
#    Completá en .env como mínimo DB_PASSWORD y SESSION_SECRET (ver comentarios del archivo).
#    DB_PORT ya viene en 5433; cambialo solo si tenés el puerto ocupado.
nano .env

# 2. Levantar la app y la BD
docker compose up -d

# 3. Crear el esquema en la base (tablas, índices, enums)
docker compose exec app pnpm db:migrate

# 4. Cargar los datos mínimos (admin + noticias + 10 ejemplos)
docker compose exec app pnpm seed

# 5. Acceder
# - Vía proxy Traefik (puerto estándar):
open http://localhost
# - Directo al servicio Next.js:
open http://localhost:3000
```

### 2.2 Windows (PowerShell o WSL)

Sobre **WSL 2**, los comandos son idénticos a los de Linux; abrí la terminal de Ubuntu y
seguí los pasos de 2.1. Sobre **Docker Desktop con PowerShell**:

```powershell
cd sistema1_5
notepad .env                # ajustá DB_PORT si el 5433 está ocupado
docker compose up -d
docker compose exec app pnpm db:migrate
docker compose exec app pnpm seed
start http://localhost
start http://localhost:3000
```

### 2.3 Datos de prueba (opcional)

```bash
# Generar el CSV (desde el host, necesita Python)
pnpm generar:datos            # 290 personas: 135 titulados, 155 egresados

# Copiarlo al contenedor y sembrar en lote
docker compose cp datos_prueba.csv app:/app/datos_prueba.csv
docker compose exec app pnpm seed:masivo
```

Para volver a los datos mínimos:

```bash
docker compose exec app pnpm seed -- --reset
```

### 2.4 Monitoreo y apagado

```bash
docker stats --no-stream                 # uso de RAM por contenedor
docker compose logs -f app               # logs de la aplicación

docker compose down                      # apagar, conserva la BD
docker compose down -v                   # apagar y BORRAR la base de datos
```

---

## 3. Escenario 2 — App con pnpm + Base de datos en Docker

Levantás Next.js en tu máquina con `pnpm dev` (recarga en caliente, útil para desarrollo),
pero la base de datos corre en un contenedor. Common entre ambos: PostgreSQL 16.

> **No edites `.env.local` a mano para este escenario.** Los comandos `:docker` ya inyectan
> el `DATABASE_URL` correcto leyendo `DB_PORT` de `.env` y las credenciales de
> `docker-compose.yml`. Así `.env.local` puede seguir apuntando a tu PostgreSQL nativo
> (escenario 3) sin que uno pise al otro, y no se puede desincronizar de los valores que
> realmente usa el contenedor.

> **El `-p sistitulados-db` de `docker-compose.db.yml` no es opcional.** Compose deriva el
> nombre del proyecto del nombre del directorio, así que sin `-p` ese archivo y el
> `docker-compose.yml` principal serían el mismo proyecto y al levantar uno, Compose
> borraría el contenedor del otro como "orphan". Con `-p` cada uno tiene su proyecto,
> sus contenedores y su volumen.

### 3.1 Linux (Ubuntu/Debian)

```bash
cd sistema1_5

# 1. Arrancar SOLO la base de datos
docker compose up -d db

# 2. Verificar que quedó healthy
docker compose ps
#    sistitulados_db   postgres:16-alpine   Up (healthy)   0.0.0.0:5433->5432/tcp

# 3. Crear el esquema (sobre la BD del contenedor)
pnpm db:migrate:docker

# 4. Cargar los datos mínimos
pnpm seed:docker

# 5. Arrancar la app en modo desarrollo
pnpm dev:docker           # http://localhost:3000
```

Si preferís hacerlo a mano, el equivalente es:

```bash
export DATABASE_URL=$(node scripts/db-url.mjs)   # imprime la URL por stdout
pnpm db:migrate && pnpm seed && pnpm dev
```

### 3.2 Windows (WSL y nativo)

En **WSL 2**, los pasos son idénticos a 3.1.

Con **Docker Desktop en Windows y Node nativo (sin WSL)**, los scripts `:docker` usan
`sh -c`, que en `cmd.exe` no existe. Usá Git Bash o WSL, o hacelo a mano en PowerShell:

```powershell
cd sistema1_5
docker compose up -d db

# PowerShell no expande `$(...)`, así que se arma la variable explícita.
# El puerto es DB_PORT de `.env` (5433 si tenés PostgreSQL nativo en 5432).
$env:DATABASE_URL = "postgresql://seguit_app:TU_DB_PASSWORD@localhost:5433/sistitulados_db"   # la DB_PASSWORD de tu .env
pnpm db:migrate
pnpm seed
pnpm dev
```

> **¿Por qué `localhost:5433` y no `db:5432`?** El host DNS `db` solo resuelve dentro de la
> red del contenedor. Desde tu máquina tenés que usar `localhost` + el puerto publicado
> (`DB_PORT`). Usar `db:5432` desde el host da `getaddrinfo ENOTFOUND db`.

### 3.3 Apagado

```bash
docker compose stop db        # apagar la BD, conserva el volumen
docker compose down db        # igual, elimina el contenedor
docker compose down -v        # apagar y borrar los datos
```

Y si usaste `docker-compose.db.yml` para la base:

```bash
docker compose -p sistitulados-db -f docker-compose.db.yml down
```

> Los dos `db` comparten `DB_PORT`, así que **no pueden estar levantados a la vez**: el
> segundo falla con `Bind for :::5433 failed: port is already allocated`. Bajá uno antes de
> levantar el otro.

---

## 4. Escenario 3 — App con pnpm + PostgreSQL local (sin Docker)

Todo directo en tu máquina. Es el escenario más rápido para trabajar y el que no depende
de que Docker esté andando.

### 4.1 Instalar y configurar

```bash
cd sistema1_5

# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env           # en Windows: copy .env.example .env
#    Editá .env: completá DATABASE_URL (ver 4.3) y SESSION_SECRET

# 3. Crear la base de datos (una sola vez)
sudo -u postgres createdb sistitulados_db
#    o, entrando a psql:
sudo -u postgres psql
#    CREATE DATABASE sistitulados_db;

# 4. Aplicar el esquema (10 tablas, índices y 13 tipos ENUM)
pnpm db:migrate

# 5. Cargar los datos mínimos (admin + noticias + 10 ejemplos)
pnpm seed

# 6. Arrancar
pnpm dev                       # http://localhost:3000
```

### 4.2 Datos de prueba (opcional)

```bash
pnpm generar:datos             # genera datos_prueba.csv (290 personas)
pnpm seed:masivo               # los carga en la base por lotes
```

La semilla es **idempotente**: si las cédulas ya existen, las omite y no duplica nada.

### 4.3 `.env` — la única fuente de verdad

Todos los comandos (`pnpm dev`, `pnpm db:*`, `pnpm seed*`) leen `DATABASE_URL` de ahí.
Si el archivo no existe o le falta la variable, los scripts fallan con un error explícito
en vez de conectarse calladamente a otra base.

```dotenv
DATABASE_URL=postgresql://postgres:TU_CLAVE@localhost:5432/sistitulados_db
```

Comprobación rápida:

```bash
psql "postgresql://postgres:TU_CLAVE@localhost:5432/sistitulados_db" -c "select 1;"
```

Si responde una fila, la conexión funciona.

### 4.4 Otros comandos

```bash
pnpm db:generate    # genera migraciones nuevas cuando cambiás src/db/schema.ts
pnpm db:migrate     # aplica las migraciones pendientes
pnpm db:push        # empuja el estado actual del esquema (SOLO desarrollo)
pnpm db:studio      # abre Drizzle Studio en el navegador
pnpm build          # build de producción
pnpm start          # ejecuta el build de producción
pnpm seed -- --reset  # borra y recarga los datos mínimos (solo desarrollo)
pnpm test           # tests
pnpm backup         # backup de la base
```

Los comandos `dev:docker`, `db:migrate:docker`, `seed:docker` y `seed:masivo:docker` son los
equivalentes del **escenario 2** (sección 3): idénticos pero apuntando a la base del
contenedor en lugar de a tu PostgreSQL local.

```
---

## 5. `SESSION_SECRET` — el secreto de la sesión

### Qué es

La sesión se guarda en una cookie `httpOnly` firmada con HMAC-SHA256. El secreto con el que se
firma **nunca sale del servidor** y **nunca se manda al navegador**. Si alguien no tiene la
cookie válida, no puede convertirse en administrador: no hay nada que falsificar desde la consola.

### En desarrollo

`scripts/seed.ts` **no necesita** este valor: en `NODE_ENV !== "production"` la aplicación usa un
secreto de desarrollo. Por eso `pnpm dev` funciona apenas se instala.

### En producción — OBLIGATORIO

La aplicación **lanza un error** al arrancar si `NODE_ENV=production` y falta `SESSION_SECRET`:
```

Error: SESSION_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.

```
### Cómo generarlo

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Sale algo como `aVrG0YqCNcUwk9OgiK7LxX0g03nMZDMtyCtWd6hrObSuIFYIZuM_5l4IRWcu7WId` (64 caracteres).

### Cómo usarlo

Opción A — en el archivo `.env` (local) o en la pestaña *Environment* de Dokploy (producción):

```dotenv
SESSION_SECRET=aVrG0YqCNcUwk9OgiK7LxX0g03nMZDMtyCtWd6hrObSuIFYIZuM_5l4IRWcu7WId
```

Opción B — como variable de entorno del proceso, sin dejar el secreto en ningún archivo:

```bash
# Linux, al arrancar con pm2
SESSION_SECRET=$(openssl rand -base64 48) pm2 start npm -- start --name seguimiento

# O en un servicio de systemd, con un archivo 600:
sudo install -m 600 /dev/null /etc/seguit/secret.env
echo "SESSION_SECRET=$(openssl rand -base64 48)" | sudo tee -a /etc/seguit/secret.env
```

### Reglas

- **Nunca** subirlo al repositorio. Ya está cubierto: `.gitignore` y `.dockerignore` ignoran `.env*` (solo se versiona `.env.example`, sin valores reales).
- Si cambia, **todas las sesiones abiertas quedan invalidadas** y hay que volver a iniciar sesión.
- Cada entorno (local, pruebas, producción) debe tener **su propio** secreto.
- Regenerarlo es la forma de "echar" a todos los que tuvieran sesión abierta.

---

## 6. Estructura del proyecto

```
sistema1_5/
├── drizzle/                     Migraciones versionadas (generadas, NO editar a mano)
│   ├── 0000_init_esquema_completo.sql
│   └── meta/
├── scripts/
│   ├── seed.ts                  Datos mínimos: admin + noticias + 10 ejemplos
│   └── seed_masivo.ts           Carga por lotes desde CSV
├── scripts_generar_seed.py      Generador de 290 personas (135 titulados, 155 egresados)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/      Iniciar sesión
│   │   │   ├── auth/sesion/     Ver sesión actual (GET) y cerrarla (DELETE)
│   │   │   ├── dashboard/       KPIs y series del dashboard
│   │   │   ├── exportar/        Excel y CSV en memoria
│   │   │   ├── exportar/pdf/    Reporte PDF en memoria
│   │   │   ├── importar/        Importación masiva Excel/CSV en memoria
│   │   │   ├── noticias/        CRUD de publicaciones
│   │   │   ├── personas/        Módulo 1: listado, alta, edición
│   │   │   ├── usuarios/        Gestión de administradores
│   │   │   └── auditoria/       Registro de actividad
│   │   ├── admin/
│   │   │   ├── dashboard/       Dashboard privado (KPIs, gráficos, exportaciones)
│   │   │   ├── personas/        Registro administrativo de titulados y egresados
│   │   │   ├── usuarios/        Usuarios administradores
│   │   │   ├── auditoria/       Consulta del registro de actividad
│   │   │   ├── importar/        Pantalla de importación masiva
│   │   │   └── noticias/        Gestión de noticias y convocatorias
│   │   ├── portal/titulado/     Formulario del titulado
│   │   ├── portal/egresado/     Formulario del egresado
│   │   ├── kpis/               Dashboards públicos
│   │   ├── noticias/           Noticias públicas
│   │   ├── titulados/          Página pública del sistema
│   │   └── login/              Inicio de sesión
│   ├── components/              Navbar, PublicDashboard, KpiNavigation, LoadingOverlay
│   ├── db/                      schema.ts (tablas) e index.ts (conexión)
│   │   └── env.ts               Carga .env.local / .env antes de armar el Pool
│   ├── lib/
│   │   ├── sesion.ts            Cookie firmada (crear/verificar token)
│   │   ├── password.ts          Hash y verificación de contraseñas (scrypt)
│   │   ├── guards.ts            Autorización de los API Routes
│   │   ├── validaciones.ts      Esquemas zod
│   │   ├── auditoria.ts         Escritura del registro de actividad
│   │   ├── reportePdf.ts        Generación del PDF en memoria
│   │   ├── csv.ts               Lector de CSV en memoria
│   │   ├── auth.tsx             Contexto de sesión en el cliente
│   │   ├── useCierreSesion.tsx  Confirmación de cierre de sesión
│   │   └── sectorOtro.ts        Validación del campo "Otro"
│   └── middleware.ts            Protección de /admin/** y /portal/** en el servidor
├── tests/                       Pruebas
├── .env.example                 Plantilla de variables (sin valores reales)
└── .env                         Tus variables reales (cp .env.example .env) — NO se sube
```

---

## 7. Usuarios y acceso

### El administrador

Lo crea `pnpm seed`:

| Campo      | Valor        |
| ---------- | ------------ |
| Correo     | `adm@gen.bo` |
| Contraseña | `adm`        |
| Rol        | `admin`      |

> **Cámbiala antes de entregar el sistema.** Entrá a *Usuarios* → ícono de llave → *Cambiar
> contraseña*. La contraseña se guarda cifrada con **scrypt**; nunca se muestra después de
> guardada y no se puede recuperar, solo cambiar.

### Titulados y egresados

Entran con su **cédula de identidad**. Si la carrera les asigna una contraseña (creando un
usuario con esa CI en *Usuarios*), también pueden entrar con CI + contraseña.

Ejemplos que trae el `seed`:

| CI          | Nombre                        | Tipo     |
| ----------- | ----------------------------- | -------- |
| `6893412LP` | Carlos Alberto Mendoza Ramos  | Titulado |
| `8341920LP` | Lucía Belén Gutierrez Morales | Egresado |

---

## 8. Seguridad: qué hace el sistema y qué no

### Lo que sí hace

| Medida                                                                                                           | Dónde                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Contraseñas cifradas con **scrypt** + salt por usuario                                                           | `src/lib/password.ts`                      |
| Comparación en **tiempo constante** (anti timing attack)                                                         | `src/lib/password.ts`, `src/lib/sesion.ts` |
| Sesión en **cookie `httpOnly` + `SameSite=Lax` + `Secure` en producción**                                        | `src/lib/sesion.ts`                        |
| Token **firmado con HMAC-SHA256** y con expiración (8 h)                                                         | `src/lib/sesion.ts`                        |
| **Rutas protegidas en el servidor** antes de renderizar                                                          | `src/middleware.ts`                        |
| **Todas las APIs verifican sesión y rol**, no solo la UI                                                         | `src/lib/guards.ts`                        |
| Cédula única e irrepetible, con alerta clara                                                                     | `src/lib/validaciones.ts`                  |
| **Límite de intentos en el login**: 5 por 15 min, con bloqueo de 15 min                                          | `src/lib/rateLimit.ts`                     |
| El limitador cuenta **por IP y por cédula**, así que atacar una cuenta desde varias IP también agota el contador | `src/lib/rateLimit.ts`                     |
| **Alta pública con verificación por token** (hash SHA-256, 48 h de vigencia, 5 intentos, un solo uso)            | `src/lib/verificacion.ts`                  |
| El alta pública **no revela si una cédula ya existe** (responde 202 en ambos casos)                              | `src/app/api/registro/route.ts`            |
| Validación de entrada con **zod** en todas las escrituras                                                        | `src/lib/validaciones.ts`                  |
| Los errores internos **no** se devuelven al cliente                                                              | `src/lib/guards.ts` → `errorInterno`       |
| Registro de quién hizo qué y cuándo, con IP y valores anteriores/nuevos                                          | `src/lib/auditoria.ts`                     |
| Los datos exportados se generan **en memoria**, nunca en disco                                                   | `src/app/api/exportar/*`                   |

### Lo que NO hace (pendiente para producción real)

- **Sin HTTPS.** Sin TLS las contraseñas viajan en claro. Es obligatorio detrás de Nginx +
  Let's Encrypt.
- **El rate limiting es en memoria**: vive en el proceso del servidor (`src/lib/rateLimit.ts`), no
  en la base. Con varias instancias cada una cuenta aparte, y al reiniciar el servidor los
  contadores se ponen en cero.
- **El correo se envía por SMTP, pero hay que configurarlo.** Complete `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASS` y `CORREO_REMITENTE` en `.env` (o en *Environment* de Dokploy). El
  cliente SMTP está en `src/lib/smtp.ts` (sin dependencias nuevas). Pruebe las credenciales con
  `pnpm correo:probar su-correo@gmail.com`. Sin configuración, `src/lib/correo.ts` no envía nada:
  imprime el enlace en la consola y lo devuelve en la respuesta de `/api/registro`.
- **Sin recuperación de contraseña.** No hay "olvidé mi contraseña" por correo. El único cambio de
  clave es manual: un admin entra a *Usuarios* → llave → *Cambiar contraseña* (exige la clave
  actual).
- **Sin CAPTCHA.** Queda el rate limiting como única defensa contra ataques automatizados.
- **La cuenta admin inicial es conocida** (`adm@gen.bo` / `adm`) si se corrió el seed.
  Hay que cambiarla.

> Nota: verificar el correo **no** habilita el registro por sí solo. La persona queda en estado
> `PENDIENTE` hasta que un administrador la valida desde *Registros*.

---

## 9. Copias de seguridad

`scripts/backup.sh` hace el backup con `pg_dump` y rota los archivos viejos:

```bash
# Ver el script
cat scripts/backup.sh

# Ejecutar a mano
bash scripts/backup.sh
```

Programarlo todos los días a las 02:00 (Linux, `crontab -e`):

```cron
0 2 * * * cd /opt/sistema1_5 && bash scripts/backup.sh >> /var/log/seguit-backup.log 2>&1
```

**Un backup que nunca se restauró no es un backup.** Pruébalo:

```bash
createdb -E UTF8 prueba_restore
pg_restore -d prueba_restore /var/backups/seguit/sistitulados_ULTIMO.dump && echo "BACKUP OK"
```

---

## 10. Problemas frecuentes

| Síntoma                                                               | Causa                                                           | Solución                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `relation "personas" does not exist`                                  | No se aplicó el esquema                                         | `pnpm db:migrate`                                                                                     |
| `password authentication failed for user "postgres"`                  | La clave de `.env.local` no coincide                            | Revisar `DATABASE_URL`                                                                                |
| `DATABASE_URL no está definido`                                       | Falta `.env` o la variable                                | `cp .env.example .env` y completarla                                                            |
| `SESSION_SECRET es obligatorio en producción`                         | Falta la variable                                               | Ver sección 5                                                                                         |
| Los apellidos con `Ñ` salen desordenados                              | La BD se creó con la collation por defecto del sistema          | Recrear la BD con la collation que usa el servidor                                                    |
| `permission denied while trying to connect to the docker API`         | El usuario no está en el grupo `docker`                         | `sudo usermod -aG docker $USER` y reiniciar sesión (sección 1.2)                                      |
| `Bind for 0.0.0.0:5432 failed: port is already allocated`             | Un PostgreSQL nativo ya ocupa el 5432                           | Mover `DB_PORT` a `5433` en `.env` (ya viene así)                                                     |
| `ECONNREFUSED` al correr `pnpm dev` con la BD en Docker               | `DATABASE_URL` apunta a `db:5432` en vez de `localhost`         | Cambiar a `localhost:5433` (sección 3.1)                                                              |
| `invalid input value for enum usuario_rol_enum: "KARDEX"`             | Faltó aplicar una migración (falta el valor del enum)           | `pnpm db:migrate` y volver a correr `pnpm seed`                                                       |
| `ERR_PNPM_LOCKFILE_WRITE_FILE` dentro del contenedor                  | pnpm intenta reescribir el lockfile como usuario `nextjs`       | Ya corregido en el `Dockerfile`; reconstruir la imagen                                                |
| `column "personas.sector_trabajo" must appear in the GROUP BY clause` | Se editó una expresión agrupada sin actualizarla                | Repetir la misma expresión en `select()` y `groupBy()`                                                |
| `CASE types ... cannot be matched`                                    | Se mezcló un enum con un `text` en un `CASE`                    | Castear con `::text`                                                                                  |
| `Cannot find module '.next/standalone/server.js'`                     | `output: "standalone"` no está activado                         | `pnpm start` (o activar standalone)                                                                   |
| Los cambios en el login no se ven                                     | Sesión vieja en la cookie                                       | Cerrar sesión y volver a entrar                                                                       |
| El captcha de Cloudflare no aparece                                   | La CSP bloquea la verificación de Turnstile                     | Ya corregido: `connect-src` incluye `challenges.cloudflare.com`. Si persiste, revisá la consola (F12) |
| Las páginas quedan en "Cargando..." para siempre                      | La CSP bloqueó el JS del cliente (`unsafe-eval` ausente en dev) | Ya corregido: `unsafe-eval` solo en desarrollo                                                        |
| `getaddrinfo ENOTFOUND db`                                            | `DATABASE_URL` apunta a `db:5432` desde el host                 | Usar `pnpm dev:docker` / `localhost:5433` (sección 3)                                                 |
| `Port 3000 is in use`                                                 | Quedó un `next start` o `next dev` anterior corriendo           | `pkill -f next-server`, o usar `PORT=3001`                                                            |
| `python` no encontrado al generar datos                               | No está Python en el PATH                                       | Usar `python3`, o instalar Python                                                                     |
