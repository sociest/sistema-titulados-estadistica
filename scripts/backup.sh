#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Respaldo lógico del Sistema de Seguimiento, generado DESDE LA APLICACIÓN.
#
# Usa el endpoint `/api/respaldar`, que vuelca la base de datos en JSON o SQL
# desde el ORM, en memoria. No necesita el cliente de PostgreSQL ni acceso
# directo al servidor de base de datos (regla `reglas/important.md` §2).
#
# Requisitos:
#   · La aplicación debe estar levantada (pnpm start o contenedor app).
#   · `curl` en el host.
#   · Una sesión de administrador: ADMIN_COOKIE, o ADMIN_CI + ADMIN_PASSWORD
#     (+ TURNSTILE_TOKEN si Turnstile real está configurado).
#
# Uso:
#   ADMIN_CI=adm@gen.bo ADMIN_PASSWORD=adm bash scripts/backup.sh
#   ADMIN_COOKIE='seguit_sesion=...' bash scripts/backup.sh
#   FORMATO=sql bash scripts/backup.sh
#   BACKUP_DIR=/otra/ruta bash scripts/backup.sh
#
# Programar (crontab -e):
#   0 2 * * * cd /opt/sistema1_5 && ADMIN_CI=... ADMIN_PASSWORD=... \
#     bash scripts/backup.sh >> /var/log/seguit-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuración ────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-${PWD}/backups}"
FORMATO="${FORMATO:-json}"
RETENER_DIAS="${RETENER_DIAS:-30}"
# `APP_URL` explícito gana sobre el `.env` (útil para probar otro puerto).
APP_URL_EXPLICITO="${APP_URL:-}"
APP_URL="${APP_URL:-${NEXT_PUBLIC_APP_URL:-http://localhost:3000}}"

# Lee .env y luego .env.local (si existen), sin depender de que las variables estén exportadas.
for archivo_env in .env .env.local; do
  if [ -f "$archivo_env" ]; then
    set -a
    # shellcheck disable=SC1090
    . "./$archivo_env"
    set +a
  fi
done
if [ -n "$APP_URL_EXPLICITO" ]; then
  APP_URL="$APP_URL_EXPLICITO"
else
  APP_URL="${NEXT_PUBLIC_APP_URL:-$APP_URL}"
fi

case "$FORMATO" in
  json|sql) ;;
  *) echo "ERROR: FORMATO debe ser 'json' o 'sql' (recibido: '$FORMATO')." >&2; exit 1 ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: no se encontró 'curl'." >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT
SELLO="$(date +%F_%H-%M-%S)"
ARCHIVO="$BACKUP_DIR/respaldo_${SELLO}.${FORMATO}"
mkdir -p "$BACKUP_DIR"

# ── Autenticación ────────────────────────────────────────────────────────────
if [ -n "${ADMIN_COOKIE:-}" ]; then
  case "$ADMIN_COOKIE" in
    *=*) COOKIE_CABECERA="$ADMIN_COOKIE" ;;
    *)   COOKIE_CABECERA="seguit_sesion=$ADMIN_COOKIE" ;;
  esac
  CURL_SESION=(-H "Cookie: $COOKIE_CABECERA")
  echo "[$(date '+%F %T')] Usando la cookie de administrador proporcionada."
else
  : "${ADMIN_CI:?Defina ADMIN_COOKIE o ADMIN_CI (identificador de administrador)}"
  : "${ADMIN_PASSWORD:?Defina ADMIN_PASSWORD (contraseña de administrador)}"

  CUERPO_LOGIN="$(
    ADMIN_CI="$ADMIN_CI" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    TURNSTILE_TOKEN="${TURNSTILE_TOKEN:-}" \
    python3 - <<'PY'
import json, os
print(json.dumps({
    "ci": os.environ["ADMIN_CI"],
    "password": os.environ["ADMIN_PASSWORD"],
    "turnstileToken": os.environ.get("TURNSTILE_TOKEN") or None,
}))
PY
  )"

  echo "[$(date '+%F %T')] Iniciando sesión como administrador en ${APP_URL}…"
  CODIGO_LOGIN="$(
    curl -sS -c "$COOKIE_JAR" -o /tmp/seguit_login.json -w "%{http_code}" \
      -X POST "${APP_URL}/api/auth/login" \
      -H "Content-Type: application/json" \
      -H "Origin: ${APP_URL}" \
      --data "$CUERPO_LOGIN" || echo "000"
  )"

  if [ "$CODIGO_LOGIN" != "200" ]; then
    echo "ERROR: el login de administrador falló (HTTP ${CODIGO_LOGIN})." >&2
    cat /tmp/seguit_login.json 2>/dev/null || true
    rm -f /tmp/seguit_login.json
    exit 1
  fi
  rm -f /tmp/seguit_login.json
  echo "[$(date '+%F %T')] Sesión de administrador iniciada."
  CURL_SESION=(-b "$COOKIE_JAR")
fi

# ── Descarga del respaldo ────────────────────────────────────────────────────
echo "[$(date '+%F %T')] Solicitando respaldo ${FORMATO} a ${APP_URL}/api/respaldar…"
CODIGO_DESCARGA="$(
  curl -sS "${CURL_SESION[@]}" -o "$ARCHIVO.tmp" -w "%{http_code}" \
    "${APP_URL}/api/respaldar?formato=${FORMATO}" || echo "000"
)"

if [ "$CODIGO_DESCARGA" != "200" ]; then
  echo "ERROR: la app respondió HTTP ${CODIGO_DESCARGA} al solicitar el respaldo." >&2
  cat "$ARCHIVO.tmp" 2>/dev/null || true
  rm -f "$ARCHIVO.tmp"
  exit 1
fi

# Comprobación mínima de integridad del archivo descargado.
if [ ! -s "$ARCHIVO.tmp" ]; then
  echo "ERROR: el respaldo descargado está vacío." >&2
  rm -f "$ARCHIVO.tmp"
  exit 1
fi

if [ "$FORMATO" = "json" ]; then
  if command -v python3 >/dev/null 2>&1; then
    if ! python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$ARCHIVO.tmp"; then
      echo "ERROR: el respaldo JSON no es válido." >&2
      rm -f "$ARCHIVO.tmp"
      exit 1
    fi
  fi
fi

mv "$ARCHIVO.tmp" "$ARCHIVO"
chmod 600 "$ARCHIVO"
TAMANO="$(du -h "$ARCHIVO" | cut -f1)"
echo "[$(date '+%F %T')] OK → $ARCHIVO ($TAMANO)"

# ── Rotación ─────────────────────────────────────────────────────────────────
# Los respaldos son datos personales (cédulas, correos, teléfonos): se quedan en
# el servidor con permisos restringidos.
BORRADOS=0
while IFS= read -r -d '' VIEJO; do
  rm -f "$VIEJO"
  BORRADOS=$((BORRADOS + 1))
done < <(find "$BACKUP_DIR" -name "respaldo_*.${FORMATO}" -type f -mtime "+$RETENER_DIAS" -print0)

echo "[$(date '+%F %T')] Rotación: $BORRADOS respaldo(s) de más de $RETENER_DIAS días eliminado(s)."

# ── Cierre de sesión ─────────────────────────────────────────────────────────
if [ -z "${ADMIN_COOKIE:-}" ]; then
  curl -sS -b "$COOKIE_JAR" -X POST "${APP_URL}/api/auth/sesion" \
    -H "Origin: ${APP_URL}" >/dev/null 2>&1 || true
fi

echo ""
echo "Para comprobar que el respaldo sirve:"
if [ "$FORMATO" = "json" ]; then
  echo "  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' '$ARCHIVO' && echo 'BACKUP OK'"
else
  echo "  psql -f '$ARCHIVO' -d <base_destino> && echo 'BACKUP OK'"
fi
