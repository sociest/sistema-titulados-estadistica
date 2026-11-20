#!/bin/bash
BASE="http://localhost:3001"
COOKIE_JAR="/tmp/sistitulados_cookies.txt"

echo "====== SISTEMA TITULADOS FUNCTIONAL AUDIT ======"
echo ""

echo "--- 1. HOMEPAGE ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
echo "GET / => $CODE"

echo ""
echo "--- 2. PUBLIC ENDPOINTS (should be 200) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/noticias")
echo "GET /api/noticias => $CODE"

echo ""
echo "--- 3. PROTECTED ENDPOINTS WITHOUT AUTH (should be 401) ---"
for ep in /api/personas /api/usuarios /api/auditoria /api/exportar /api/importar /api/respaldar; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$ep")
  echo "GET $ep (no auth) => $CODE"
done

echo ""
echo "--- 4. KARDEX ENDPOINT WITHOUT AUTH (should be 401) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/kardex/solicitudes")
echo "GET /api/kardex/solicitudes (no auth) => $CODE"

echo ""
echo "--- 5. DASHBOARD (should be 200 public) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dashboard")
echo "GET /api/dashboard => $CODE"

echo ""
echo "--- 6. LOGIN: attempt with no seed data ---"
BODY='{"ci":"adm@gen.bo","password":"adm","turnstileToken":""}'
RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  --data-raw "$BODY" -w "\nHTTP_CODE:%{http_code}")
echo "POST /api/auth/login => $RESP"

echo ""
echo "--- 7. LOGIN: wrong credentials (should be 401 or 403) ---"
BODY='{"ci":"noexiste","password":"wrong","turnstileToken":""}'
RESP=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE" \
  --data-raw "$BODY" -w "\nHTTP_CODE:%{http_code}")
echo "POST /api/auth/login (wrong) => $RESP"

echo ""
echo "--- 8. CSRF check: POST without Origin (should be 403) ---"
BODY='{"ci":"adm@gen.bo","password":"adm","turnstileToken":""}'
RESP=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  --data-raw "$BODY" -w "\nHTTP_CODE:%{http_code}")
echo "POST /api/auth/login (no Origin) => $RESP"

echo ""
echo "--- 9. RATE LIMIT: 6 rapid bad attempts ---"
for i in 1 2 3 4 5 6; do
  BODY="{\"ci\":\"ratelimitci\",\"password\":\"bad$i\",\"turnstileToken\":\"\"}"
  CODE=$(curl -s -o /dev/null -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE" \
    --data-raw "$BODY" -w "%{http_code}")
  echo "  Attempt $i => $CODE"
done

echo ""
echo "--- 10. REGISTRO endpoint ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/registro" -H "Content-Type: application/json" -H "Origin: $BASE" --data-raw '{}')
echo "POST /api/registro (empty) => $CODE"

echo ""
echo "--- 11. VERIFICAR endpoint (GET) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/verificar?token=invalid")
echo "GET /api/verificar?token=invalid => $CODE"

echo ""
echo "--- 12. RECUPERAR endpoint ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/recuperar" -H "Content-Type: application/json" -H "Origin: $BASE" --data-raw '{"correo":"noexiste@test.com"}')
echo "POST /api/auth/recuperar => $CODE"

echo ""
echo "--- 13. SOLICITUDES without auth ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/solicitudes")
echo "GET /api/solicitudes (no auth) => $CODE"

echo ""
echo "--- 14. MIS-DATOS without auth ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/mis-datos")
echo "GET /api/mis-datos (no auth) => $CODE"

echo ""
echo "--- 15. CARRERAS without auth ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/carreras")
echo "GET /api/carreras (no auth) => $CODE"

echo ""
echo "====== AUDIT COMPLETE ======"
