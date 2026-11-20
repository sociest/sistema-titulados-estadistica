#!/bin/bash
BASE="http://localhost:3001"
COOKIE_JAR="/tmp/sistitulados_auth_cookies.txt"
rm -f "$COOKIE_JAR"

echo "====== SISTEMA TITULADOS AUTH FLOW AUDIT (con seed) ======"

echo ""
echo "--- A. LOGIN ADMIN CORRECTO ---"
RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -w "\nHTTP:%{http_code}" \
  --data-raw '{"ci":"adm@gen.bo","password":"adm","turnstileToken":""}')
echo "POST /api/auth/login (admin) => $RESP"

echo ""
echo "--- B. ADMIN ACCEDE A PERSONAS (con cookie) ---"
RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  "$BASE/api/personas" \
  -w "\nHTTP:%{http_code}" | head -c 400)
echo "GET /api/personas (admin) => $RESP"

echo ""
echo "--- C. ADMIN ACCEDE A USUARIOS ---"
RESP=$(curl -s -b "$COOKIE_JAR" \
  "$BASE/api/usuarios" \
  -w "\nHTTP:%{http_code}" | head -c 400)
echo "GET /api/usuarios (admin) => $RESP"

echo ""
echo "--- D. ADMIN ACCEDE A AUDITORIA ---"
RESP=$(curl -s -b "$COOKIE_JAR" \
  "$BASE/api/auditoria" \
  -w "\nHTTP:%{http_code}" | head -c 400)
echo "GET /api/auditoria (admin) => $RESP"

echo ""
echo "--- E. ADMIN ACCEDE A DASHBOARD ---"
RESP=$(curl -s -b "$COOKIE_JAR" \
  "$BASE/api/dashboard?scope=admin" \
  -w "\nHTTP:%{http_code}" | head -c 400)
echo "GET /api/dashboard?scope=admin (admin) => $RESP"

echo ""
echo "--- F. LOGOUT ---"
RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/logout" \
  -H "Origin: $BASE" \
  -w "\nHTTP:%{http_code}")
echo "POST /api/auth/logout => $RESP"

echo ""
echo "--- G. DESPUES DE LOGOUT: acceso protegido (debe ser 401) ---"
RESP=$(curl -s -b "$COOKIE_JAR" \
  "$BASE/api/personas" \
  -w "\nHTTP:%{http_code}" | head -c 200)
echo "GET /api/personas (post-logout) => $RESP"

echo ""
echo "--- H. LOGIN KARDEX ---"
rm -f /tmp/sistitulados_kardex_cookies.txt
RESP=$(curl -s -c /tmp/sistitulados_kardex_cookies.txt \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  -w "\nHTTP:%{http_code}" \
  --data-raw '{"ci":"kardex@gen.bo","password":"kardex123","turnstileToken":""}')
echo "POST /api/auth/login (kardex) => $RESP"

echo ""
echo "--- I. KARDEX ACCEDE A SU RUTA ---"
RESP=$(curl -s -b /tmp/sistitulados_kardex_cookies.txt \
  "$BASE/api/kardex/solicitudes" \
  -w "\nHTTP:%{http_code}" | head -c 300)
echo "GET /api/kardex/solicitudes (kardex) => $RESP"

echo ""
echo "--- J. KARDEX INTENTA ACCEDER A ADMIN (debe ser 403) ---"
RESP=$(curl -s -b /tmp/sistitulados_kardex_cookies.txt \
  "$BASE/api/personas" \
  -w "\nHTTP:%{http_code}" | head -c 200)
echo "GET /api/personas (kardex, debe ser 403) => $RESP"

echo ""
echo "--- K. EXPORTAR CSV (admin) ---"
rm -f /tmp/sistitulados_admin2_cookies.txt
curl -s -c /tmp/sistitulados_admin2_cookies.txt -b /tmp/sistitulados_admin2_cookies.txt \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  --data-raw '{"ci":"adm@gen.bo","password":"adm","turnstileToken":""}' > /dev/null
RESP=$(curl -s -b /tmp/sistitulados_admin2_cookies.txt \
  "$BASE/api/exportar" \
  -w "\nHTTP:%{http_code}" | head -c 200)
echo "GET /api/exportar (admin) => $RESP"

echo ""
echo "--- L. NOTICIAS PUBLICAS (GET sin auth) ---"
RESP=$(curl -s "$BASE/api/noticias" -w "\nHTTP:%{http_code}" | head -c 400)
echo "GET /api/noticias => $RESP"

echo ""
echo "====== AUTH AUDIT COMPLETE ======"
