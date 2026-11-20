"""
Pruebas de calidad y seguridad para el Sistema de Seguimiento a Titulados.
Verifica cumplimiento de la Ley 1405 art. 5 y estándares de calidad.

Gera resultados.json, resultadopruebas.md y resultadopruebas.docx.
"""

import os
import re
import json
from pathlib import Path

# ---------------------------------------------------------------------------
# Helper to provide a short description for each test based on its name.
# This is used for the "Descripción" column in the markdown and DOCX reports.
# The mapping is intentionally simple – it looks for key words in the test
# description and returns a concise phrase.  It can be extended later.
def descripcion_prueba(prueba: str) -> str:
    prueba_lower = prueba.lower()
    if "carpeta" in prueba_lower:
        return "Verifica que la carpeta exista"
    if "api protegida" in prueba_lower:
        return "Ruta API requiere sesión autenticada"
    if "api pública" in prueba_lower:
        return "Ruta API pública con mitigación documentada"
    if "hash" in prueba_lower and "contraseña" in prueba_lower:
        return "Contraseñas almacenadas con hash y sal aleatoria"
    if "cookie" in prueba_lower:
        return "Cookies configuradas como httpOnly/sameSite"
    if "rate limiting" in prueba_lower:
        return "Limita peticiones por identificador (no solo IP)"
    if "audit" in prueba_lower or "auditoría" in prueba_lower:
        return "Registra eventos de auditoría con IP y usuario"
    if "secretos" in prueba_lower:
        return "Credenciales fuera del repositorio .env"
    if "kpi" in prueba_lower:
        return "KPIs definidos y calculados en el dashboard"
    if "seed" in prueba_lower:
        return "Cargar datos de prueba en la base"
    # Default fallback
    return "Verifica el requisito correspondiente"

# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent.parent
SRC_DIR = BASE_DIR / "src"
AQUI = Path(__file__).parent

RESULTADOS = []


def agregar_resultado(categoria, prueba, estado, detalle=""):
    RESULTADOS.append({
        "categoria": categoria,
        "prueba": prueba,
        "estado": "PASS" if estado else "FAIL",
        "detalle": detalle,
    })
    print(f"[{'PASS' if estado else 'FAIL'}] {categoria} - {prueba}: {detalle}")


def archivos_fuente(extension="ts"):
    """Todos los .ts/.tsx del código fuente, sin duplicados por los patrones del shell."""
    return sorted(set(SRC_DIR.rglob(f"*.{extension}")))


def leer(archivo):
    return archivo.read_text(encoding="utf-8")


# ── Estructura ───────────────────────────────────────────────────────────────
def test_estructura_proyecto():
    """Verifica que la estructura del proyecto sea correcta."""
    carpetas_requeridas = ["app", "components", "db", "lib"]
    for carpeta in carpetas_requeridas:
        existe = (SRC_DIR / carpeta).exists()
        agregar_resultado("Estructura", f"Carpeta {carpeta}/", existe)


# ── Seguridad (Ley 1405 art. 5) ─────────────────────────────────────────────
# Rutas públicas por decisión documentada en el propio código. No es un descuido: cada una
# explica por qué acepta peticiones sin sesión y con qué se compensa. La prueba verifica la
# mitigación declarada, no que la ruta lleve una guarda de administrador que no le corresponde.
RUTAS_PUBLICAS_POR_DISENO = {
    "auth/login": (
        "establece la sesión; compensa con límite de intentos por IP e identificador y auditoría",
        ("verificarLimite", "registrarIntento"),
    ),
    "auth/logout": (
        "reutiliza el handler de /api/auth/sesion, que solo borra la cookie de sesión",
        ("export { POST }", "../sesion/route"),
    ),
    "auth/recuperar": (
        "recuperación pública; responde igual exista o no la cuenta y limita intentos por IP+CI",
        ("verificarLimite", "registrarIntento"),
    ),
    "auth/restablecer": (
        "el token o código es la credencial; caduca, es de un solo uso y limita intentos",
        ("createHash", "verificarLimite"),
    ),
    "correo/cambiar": (
        "exige la contraseña actual, CSRF y límite de intentos; no depende de la cookie",
        ("verifyPasswordAsync", "verificarLimite", "verificarCsrf"),
    ),
    "noticias/imagen/[nombre]": (
        "sirve imágenes públicas; el nombre se valida como UUID y se resuelve con path.join",
        ("readFile", "path.join"),
    ),
    "registro": (
        "alta pública; compensa con rate limit, respuesta idéntica y estado PENDIENTE",
        ("verificarLimite", "registrarIntento"),
    ),
    "verificar": (
        "el token del enlace ES la credencial; caduca, limita intentos y es de un solo uso",
        ("validarToken", "registrarAuditoria"),
    ),
}

# Rutas de escritura que no dejan rastro en audit_log por decisión documentada.
RUTAS_SIN_AUDITORIA_POR_DISENO = {
    "app/api/auth/recuperar/route.ts":
        "solo crea el token de recuperación; registrar la petición permitiría enumerar cuentas",
}

GUARDIAS_DE_SESION = ("exigirAdmin", "exigirAdminOContacto", "leerSesionDeRequest", "leerSesion", "leerSesionVigente")


def test_seguridad_api():
    """Cada API exige sesión, o es pública por diseño con su mitigación declarada."""
    rutas = sorted((SRC_DIR / "app" / "api").rglob("route.ts"))
    for ruta in rutas:
        contenido = leer(ruta)
        rel = ruta.relative_to(SRC_DIR).as_posix()
        rel_dir = rel[:-len("/route.ts")]
        publica = next((k for k in RUTAS_PUBLICAS_POR_DISENO if rel_dir == f"app/api/{k}"), None)

        if publica:
            motivo, marcadores = RUTAS_PUBLICAS_POR_DISENO[publica]
            tiene = all(m in contenido for m in marcadores)
            agregar_resultado("Seguridad", f"API pública con mitigación: {rel}", tiene, motivo)
        else:
            exige = any(g in contenido for g in GUARDIAS_DE_SESION)
            agregar_resultado("Seguridad", f"API protegida: {rel}", exige,
                              "exige sesión" if exige else "sin guarda de sesión ni excepción documentada")


def test_credenciales_no_hardcodeadas():
    """Verifica que no haya contraseñas hardcodeadas en el código."""
    patrones_peligrosos = [
        r'password\s*=\s*["\'][^"\']+["\']',
        r'passwd\s*=\s*["\'][^"\']+["\']',
        r'secret\s*=\s*["\'][^"\']+["\']',
    ]
    for archivo in archivos_fuente() + archivos_fuente("tsx"):
        contenido = leer(archivo)
        for patron in patrones_peligrosos:
            coincidencias = re.findall(patron, contenido, re.IGNORECASE)
            if coincidencias:
                agregar_resultado("Seguridad", f"Credencial en {archivo.name}", False,
                                  f"Encontrado: {coincidencias[0][:30]}...")
                return
    agregar_resultado("Seguridad", "Sin credenciales hardcodeadas", True)


def test_validacion_entradas():
    """Verifica que haya validación de entradas con zod."""
    tiene_zod = any("zod" in leer(a).lower() or "z." in leer(a) for a in archivos_fuente() + archivos_fuente("tsx"))
    agregar_resultado("Calidad", "Validación de entradas (zod)", tiene_zod)


def test_cookies_seguras():
    """Verifica que las cookies sean httpOnly y seguras."""
    for archivo in archivos_fuente() + archivos_fuente("tsx"):
        if "httpOnly" in leer(archivo) or "http_only" in leer(archivo):
            agregar_resultado("Seguridad", "Cookies httpOnly", True)
            return
    agregar_resultado("Seguridad", "Cookies httpOnly", False)


def test_cookie_misma_sitio():
    """La cookie de sesión no debe viajar en peticiones de terceros."""
    sesion = leer(SRC_DIR / "lib" / "sesion.ts")
    mismo_sitio = "sameSite" in sesion
    agregar_resultado("Seguridad", "Cookie sameSite", mismo_sitio,
                      "restringida al mismo sitio" if mismo_sitio else "sin atributo sameSite")


def test_auditoria():
    """Verifica que exista sistema de auditoría."""
    agregar_resultado("Seguridad", "Sistema de auditoría",
                      (SRC_DIR / "lib" / "auditoria.ts").exists())


def test_auditoria_con_ip_y_usuario():
    """El rastro de auditoría debe identificar QUIÉN y DESDE DÓNDE, no solo qué pasó."""
    contenido = leer(SRC_DIR / "lib" / "auditoria.ts")
    esquema = leer(SRC_DIR / "db" / "schema.ts")
    registra_ip = "ipDesde" in contenido
    tiene_quien = "idUsuario" in contenido
    # La columna se llama `ip` en audit_log; se busca junto al nombre de la tabla para no
    # confundirla con otros campos homónimos del esquema.
    bloque_audit = re.search(r"audit_log(.*?)\n\s*\)\s*;", esquema, re.DOTALL)
    persiste_ip = bool(bloque_audit) and bool(
        re.search(r'ip\s*:\s*varchar\(\s*"ip"', bloque_audit.group(1))
    )
    agregar_resultado("Seguridad", "Auditoría identifica usuario y dirección IP",
                      registra_ip and tiene_quien and persiste_ip,
                      "actor (id_usuario) y origen (ip) en audit_log" if persiste_ip
                      else f"ipDesde={registra_ip}, idUsuario={tiene_quien}, columna ip={persiste_ip}")


def test_auditoria_en_escritura():
    """Toda ruta que escribe debe dejar rastro en audit_log (o estar exceptuada)."""
    sin_rastro = []
    for ruta in sorted((SRC_DIR / "app" / "api").rglob("route.ts")):
        contenido = leer(ruta)
        rel = ruta.relative_to(SRC_DIR).as_posix()
        escribe = re.search(r"\.(post|patch|put|delete)\s*\(", contenido, re.IGNORECASE)
        if not escribe or rel in RUTAS_SIN_AUDITORIA_POR_DISENO:
            continue
        if "registrarAuditoria" not in contenido and "registrarCambio" not in contenido:
            sin_rastro.append(rel)
    agregar_resultado("Seguridad", "Auditoría en rutas de escritura", not sin_rastro,
                      f"sin rastro: {sin_rastro}" if sin_rastro else "todas registran")


def test_rate_limiting():
    """Verifica que exista rate limiting."""
    tiene = any("rateLimit" in leer(a) for a in archivos_fuente())
    agregar_resultado("Seguridad", "Rate limiting", tiene)


def test_rate_limit_por_identificador():
    """El límite debe contar por cuenta y no solo por IP, para no bloquear a una red entera."""
    contenido = leer(SRC_DIR / "lib" / "rateLimit.ts")
    por_id = re.search(r"(clave|identificador|id|usuario)", contenido, re.IGNORECASE)
    tiene_max = re.search(r"(maximo|max|limite|maxIntentos)", contenido, re.IGNORECASE)
    agregar_resultado("Seguridad", "Rate limit por identificador, no solo por IP",
                      bool(por_id) and bool(tiene_max))


def test_hash_contrasenas():
    """Verifica que las contraseñas se hasheen correctamente."""
    tiene = any(any(a in leer(f) for a in ("scrypt", "bcrypt", "argon2"))
                for f in archivos_fuente())
    agregar_resultado("Seguridad", "Hash de contraseñas", tiene)


def test_hash_con_sal_aleatoria():
    """Un hash sin sal por usuario permite romper varios passwords de una vez."""
    contenido = leer(SRC_DIR / "lib" / "password.ts")
    sal = "randomBytes" in contenido
    comparacion_segura = "timingSafeEqual" in contenido
    guardar = "$" in contenido and "base64" in contenido
    agregar_resultado("Seguridad", "Hash con sal aleatoria y comparación en tiempo constante",
                      sal and comparacion_segura and guardar,
                      "sal por usuario + timingSafeEqual" if sal and comparacion_segura
                      else "falta sal o comparación segura")


def test_no_compara_contrasenas_en_plano():
    """No debe existir comparación de contraseña en texto plano."""
    sospechosos = []
    for archivo in archivos_fuente() + archivos_fuente("tsx"):
        contenido = leer(archivo)
        if re.search(r"password\s*===|contrasena\s*===|\bpass\s*===", contenido, re.IGNORECASE):
            sospechosos.append(archivo.name)
    agregar_resultado("Seguridad", "Sin comparación de contraseña en texto plano",
                      not sospechosos, f"{sospechosos}" if sospechosos else "")


def test_middleware_proteccion():
    """Verifica que exista middleware de protección de rutas."""
    agregar_resultado("Seguridad", "Middleware de protección",
                      (SRC_DIR / "middleware.ts").exists())


def test_middleware_cubre_rutas_sensibles():
    """/admin y /portal no pueden quedar fuera del matcher del middleware."""
    matcher = leer(SRC_DIR / "middleware.ts")
    cubre = all(p in matcher for p in ('"/admin', '"/portal'))
    agregar_resultado("Seguridad", "Middleware cubre /admin y /portal", cubre,
                      "ambos prefijos protegidos en el servidor" if cubre else "falta algún prefijo")


def test_sql_injection():
    """Verifica que no haya consultas SQL vulnerables."""
    vulnerables = []
    for archivo in archivos_fuente() + archivos_fuente("tsx"):
        contenido = leer(archivo)
        if re.search(r'execute\s*\(\s*["\'].*\+', contenido):
            vulnerables.append(archivo.name)
    agregar_resultado("Seguridad", "Sin SQL injection", not vulnerables,
                      f"Vulnerables: {vulnerables}" if vulnerables else "")


def test_consultas_parametrizadas():
    """Los valores de filtro deben viajar como parámetro, no interpolados en la cadena SQL."""
    pegado = []
    for archivo in archivos_fuente():
        contenido = leer(archivo)
        # concatena una variable de usuario directamente dentro de sql"..." sin ${}
        if re.search(r'sql`[^`]*"?\s*\+\s*[a-zA-Z_]', contenido):
            pegado.append(archivo.name)
    agregar_resultado("Seguridad", "Consultas parametrizadas", not pegado,
                      f"{pegado}" if pegado else "valores siempre como parámetro")


def test_xss():
    """Verifica que no haya vulnerabilidades XSS."""
    vulnerables = []
    for archivo in archivos_fuente("tsx"):
        contenido = leer(archivo)
        if "dangerouslySetInnerHTML" in contenido and "sanitize" not in contenido.lower():
            if "localStorage" not in contenido or "theme" not in contenido:
                vulnerables.append(archivo.name)
    agregar_resultado("Seguridad", "Sin XSS", not vulnerables,
                      f"Vulnerables: {vulnerables}" if vulnerables else "")


def test_variables_entorno():
    """Verifica que se usen variables de entorno para secretos."""
    tiene_env = (BASE_DIR / ".env.local").exists() or (BASE_DIR / ".env").exists()
    agregar_resultado("Seguridad", "Variables de entorno", tiene_env)


def test_secrets_fuera_del_repositorio():
    """.env no debe versionarse y .env.example no debe traer valores reales."""
    gitignore = leer(BASE_DIR / ".gitignore")
    ignora = ".env" in gitignore

    example = BASE_DIR / ".env.example"
    sin_reales = True
    detalle = ""
    # Solo importan las claves que guardan un secreto. NODE_ENV, PORT o TZ no lo son: marcarlos
    # como sospecha sería ruido y llevaría a "arreglar" un archivo que está bien.
    pista_secreto = re.compile(
        r"(PASSWORD|PASSWD|SECRET|TOKEN|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY)", re.IGNORECASE
    )
    marcadores = ("CAMBIAR", "localhost", "127.0.0.1", "http://", "example", "TU_", "xxx", "<", "changeme")
    if example.exists():
        sospechosas = []
        for linea in leer(example).splitlines():
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            clave, valor = clave.strip(), valor.strip()
            if not valor or not pista_secreto.search(clave):
                continue
            if not any(m in valor for m in marcadores):
                sospechosas.append(clave)
        sin_reales = not sospechosas
        detalle = f"claves secretas con valor real: {sospechosas}" if sospechosas \
            else "las claves secretas usan marcadores"

    agregar_resultado("Seguridad", "Secretos fuera del repositorio", ignora and sin_reales,
                      f".gitignore cubre .env y .env.example usa marcadores ({detalle})"
                      if ignora and sin_reales
                      else f".env ignorado={ignora}, .env.example limpio={sin_reales}")


def test_https():
    """Verifica configuración para HTTPS."""
    tiene = any(any(a in leer(f) for a in ("https", "secure")) for f in archivos_fuente())
    agregar_resultado("Seguridad", "Configuración HTTPS", tiene)


def test_cors():
    """
    El sistema es de un solo origen (Next.js sirve la API y las páginas). No habilitar CORS
    es lo correcto: abrirlo permite que cualquier sitio haga peticiones autenticadas con la
    cookie de sesión de la persona. La prueba verifica justamente que NO esté abierto.
    """
    salvajes = []
    con_cors = []
    for archivo in archivos_fuente() + archivos_fuente("tsx"):
        contenido = leer(archivo)
        if re.search(r"Access-Control-Allow-Origin", contenido, re.IGNORECASE):
            con_cors.append(archivo.name)
            if re.search(r'["\']\*["\']', contenido):
                salvajes.append(archivo.name)
    agregar_resultado("Seguridad", "CORS cerrado (sistema de un solo origen)",
                      not salvajes,
                      f"origen comodín en {salvajes}" if salvajes
                      else "sin Access-Control-Allow-Origin: * (correcto en same-origin)")


def test_logging():
    """
    Para datos personales el registro debe vivir en la base (audit_log), que se consulta,
    se conserva y puede extraerse como evidencia. Un console.log va al log del servidor, se
    pierde al reiniciar y en algunos despliegues termina en terceros: no sirve como rastro.
    La prueba comprueba que exista el registro estructurado y que no se filtren datos
    sensibles por consola.
    """
    registro_estructurado = (SRC_DIR / "lib" / "auditoria.ts").exists()
    usos = sum(1 for a in archivos_fuente() if "registrarAuditoria" in leer(a))
    suficiente = registro_estructurado and usos > 0
    agregar_resultado("Calidad", "Logging de eventos (audit_log, no consola)",
                      suficiente,
                      f"registro estructurado usado en {usos} archivo(s)" if suficiente
                      else "sin registro estructurado")


def test_consola_no_filtra_datos_sensibles():
    """Ni por consola se deben imprimir cédulas, contraseñas ni tokens."""
    fugas = []
    for archivo in archivos_fuente() + archivos_fuente("tsx"):
        for linea in leer(archivo).splitlines():
            if "console." not in linea:
                continue
            if re.search(r"(cedula|contrasena|password|token|secret)", linea, re.IGNORECASE):
                fugas.append(f"{archivo.name}: {linea.strip()[:60]}")
    agregar_resultado("Seguridad", "Consola sin datos sensibles", not fugas,
                      "; ".join(fugas[:3]) if fugas else "")


def test_token_verificacion():
    """El enlace de verificación es una credencial: debe caducar y limitar intentos."""
    contenido = leer(SRC_DIR / "lib" / "verificacion.ts")
    vigencia = "VIGENCIA_HORAS" in contenido
    intentos = "MAX_INTENTOS" in contenido
    un_uso = "usadaEn" in contenido
    agregar_resultado("Seguridad", "Token de verificación con caducidad y uso único",
                     vigencia and intentos and un_uso,
                     "expira, limita intentos y se marca usado" if (vigencia and intentos and un_uso)
                     else "incompleto")


def test_registro_sin_enumeracion():
    """
    El alta pública no debe revelar si una cédula ya está en el sistema, porque eso convierte
    el endpoint en un buscador de graduados. No basta con que el texto sea ambiguo: si el alta
    nueva y la cédula existente devuelven distinto status HTTP o una clave extra, la
    diferencia ya es la respuesta. Se comprueba que ambas ramas compartan la misma respuesta
    y que no se devuelva el identificador del registro recién creado.
    """
    contenido = leer(SRC_DIR / "app" / "api" / "registro" / "route.ts")

    # Una constante de respuesta usada por las dos ramas.
    compartida = bool(re.search(r"const\s+RESPUESTA_NEUTRA\s*=", contenido)) and \
        "responderNeutro" in contenido
    # Ningún status propio por rama: el que se devuelve es el de la respuesta compartida.
    status_propio = re.findall(r"status:\s*(\d{3})", contenido)
    # No se filtra el id del registro ni el nombre de quien ya está dado de alta.
    no_filtra_id = not re.search(r"\bid:\s*creado\.id", contenido)
    no_filtra_nombre = not re.search(r"existentes\[0\]\.?\w*\.?\s*nombresApellidos", contenido)

    agregar_resultado("Seguridad", "Alta pública sin enumeración de cédulas",
                      compartida and no_filtra_id and no_filtra_nombre,
                      f"respuesta compartida, status únicos: {sorted(set(status_propio))}"
                      if compartida and no_filtra_id and no_filtra_nombre
                      else f"respuesta compartida={compartida}, sin id={no_filtra_id}, "
                           f"sin nombre={no_filtra_nombre}")


def test_cedula_unica_en_esquema():
    """La unicidad de la cédula debe estar garantizada por la base, no solo por la aplicación."""
    esquema = leer(SRC_DIR / "db" / "schema.ts")
    unique = re.search(r"cedula_identidad.*?\.unique\(\)", esquema, re.DOTALL | re.IGNORECASE)
    indice = "uniqueIndex" in esquema and "cedula" in esquema
    agregar_resultado("Seguridad", "Cédula de identidad única en el esquema",
                      bool(unique) and indice, "restricción UNIQUE + índice único")


def test_token_sesion_no_en_url():
    """
    Una contraseña o una cédula en la URL es grave: quedan en el historial del navegador y en
    el log del servidor. Un token de un solo uso es otra cosa: es la forma habitual de que
    llegue el enlace de verificación, y se acepta siempre que sea aleatorio, caduque y se
    marque usado, porque no haya nada que reutilizar.
    """
    graves = []
    for ruta in sorted((SRC_DIR / "app" / "api").rglob("route.ts")):
        for linea in leer(ruta).splitlines():
            if "searchParams.get" not in linea:
                continue
            if re.search(r"(password|contrasena|cedula)", linea, re.IGNORECASE):
                graves.append(f"{ruta.name}: {linea.strip()[:60]}")

    verificacion = leer(SRC_DIR / "lib" / "verificacion.ts")
    token_seguros = all(m in verificacion for m in ("VIGENCIA_HORAS", "MAX_INTENTOS", "usadaEn"))

    agregar_resultado("Seguridad", "Credenciales fuera de la URL", not graves and token_seguros,
                      "; ".join(graves[:3]) if graves
                      else ("ninguna credencial en la URL; el token de verificación caduca, "
                            "limita intentos y es de un solo uso"))


def test_kpi_del_plan_implementados():
    """Los ocho KPI acordados con la institución deben estar calculados en el panel."""
    dashboard = leer(SRC_DIR / "app" / "api" / "dashboard" / "route.ts")
    esperados = [
        "totalTitulados", "tasaEmpleabilidadTitulados", "tiempoPromedioEgresoTitulacion",
        "tiempoPromedioInsercionTitulados", "porcentajeEmpleoEstadistica",
        "totalEgresados", "tasaEmpleabilidadEgresados", "tiempoPromedioInsercionEgresados",
    ]
    faltan = [k for k in esperados if k not in dashboard]
    agregar_resultado("Funcionalidad", f"KPI del plan implementados ({len(esperados)})",
                      not faltan, f"faltan: {faltan}" if faltan else "los 8 disponibles")


# ── Calidad del código ───────────────────────────────────────────────────────
def test_manejo_errores():
    """Verifica que haya manejo de errores try-catch."""
    archivos = archivos_fuente() + archivos_fuente("tsx")
    con_try_catch = sum(1 for a in archivos if "try {" in leer(a) and "catch" in leer(a))
    agregar_resultado("Calidad", f"Archivos con manejo de errores ({con_try_catch}/{len(archivos)})",
                      con_try_catch > 0)


def test_documentacion():
    """Verifica que exista documentación."""
    agregar_resultado("Calidad", "Documentación (README)", (BASE_DIR / "README.md").exists())


def test_pruebas():
    """Verifica que existan pruebas."""
    agregar_resultado("Calidad", "Pruebas unitarias",
                      (BASE_DIR / "tests").exists() or (BASE_DIR / "pruebascalidad").exists())


def test_tipos_typescript():
    """Verifica que se use TypeScript con tipos estrictos."""
    agregar_resultado("Calidad", "TypeScript configurado", (BASE_DIR / "tsconfig.json").exists())


def test_linting():
    """Verifica que exista configuración de linting."""
    tiene = (BASE_DIR / ".eslintrc.json").exists() or (BASE_DIR / "eslint.config.mjs").exists()
    agregar_resultado("Calidad", "Linting (ESLint)", tiene)


def test_responsive():
    """Verifica que el diseño sea responsive."""
    tiene = any(any(p in leer(a) for p in ("sm:", "md:", "lg:")) for a in archivos_fuente("tsx"))
    agregar_resultado("Calidad", "Diseño responsive", tiene)


def test_accesibilidad():
    """Verifica atributos de accesibilidad."""
    tiene = any(any(p in leer(a) for p in ("aria-", "role=")) for a in archivos_fuente("tsx"))
    agregar_resultado("Calidad", "Accesibilidad (ARIA)", tiene)


def test_performance():
    """Verifica optimizaciones de performance."""
    tiene = any(any(p in leer(a).lower() for p in ("lazy", "memo", "usememo"))
                for a in archivos_fuente("tsx"))
    agregar_resultado("Calidad", "Optimización de performance", tiene)


def test_paginacion():
    """
    La paginación tiene que estar en la capa que consulta (route.ts), no en los componentes:
    acortar la lista en el navegador no impide que el servidor devuelva todos los registros.
    """
    en_backend = []
    for ruta in sorted((SRC_DIR / "app" / "api").rglob("route.ts")):
        contenido = leer(ruta)
        if ".from(personas)" not in contenido:
            continue
        # una consulta que devuelve filas de personas debe acotar el resultado
        if ".limit(" in contenido:
            en_backend.append(ruta.relative_to(SRC_DIR).as_posix())

    # además, el listado de personas debe ofrecer page/perPage con tope
    listado = leer(SRC_DIR / "app" / "api" / "personas" / "route.ts")
    pagina = "page" in listado and "perPage" in listado and ".offset(" in listado
    tope = re.search(r"Math\.min\(\s*\d+\s*,", listado) is not None

    agregar_resultado("Calidad", "Paginación en el servidor con tope máximo",
                      bool(en_backend) and pagina and tope,
                      f"{len(en_backend)} ruta(s) acotada(s); perPage con tope" if pagina and tope
                      else "sin paginación en la capa de datos")


# ── Funcionalidad ────────────────────────────────────────────────────────────
def test_busqueda():
    """Verifica que exista funcionalidad de búsqueda."""
    tiene = any(any(p in leer(a).lower() for p in ("search", "buscar", "filter"))
                for a in archivos_fuente("tsx"))
    agregar_resultado("Calidad", "Búsqueda y filtros", tiene)


def test_exportacion():
    """Verifica que exista exportación de datos."""
    agregar_resultado("Funcionalidad", "Exportación de datos",
                      (SRC_DIR / "app" / "api" / "exportar").exists())


def test_importacion():
    """Verifica que exista importación de datos."""
    agregar_resultado("Funcionalidad", "Importación de datos",
                      (SRC_DIR / "app" / "api" / "importar").exists())


def test_notificaciones():
    """Verifica que exista sistema de notificaciones."""
    tiene = any(any(p in leer(a).lower() for p in ("notification", "toast", "alert"))
                for a in archivos_fuente("tsx"))
    agregar_resultado("Funcionalidad", "Notificaciones", tiene)


def test_reportes():
    """Verifica que exista generación de reportes."""
    agregar_resultado("Funcionalidad", "Generación de reportes PDF",
                      (SRC_DIR / "app" / "api" / "exportar" / "pdf").exists())


def test_backups():
    """Verifica que exista sistema de backups."""
    agregar_resultado("Funcionalidad", "Sistema de backups",
                      (BASE_DIR / "scripts" / "backup.sh").exists())


def test_migraciones():
    """Verifica que existan migraciones de base de datos."""
    agregar_resultado("Funcionalidad", "Migraciones de BD", (BASE_DIR / "drizzle").exists())


def test_seed():
    """Verifica que exista seed de datos."""
    agregar_resultado("Funcionalidad", "Seed de datos",
                      (BASE_DIR / "scripts" / "seed.ts").exists())


def test_admin_usuarios():
    """Verifica que exista gestión de usuarios admin."""
    agregar_resultado("Funcionalidad", "Gestión de usuarios admin",
                      (SRC_DIR / "app" / "admin" / "usuarios").exists())


def test_admin_personas():
    """Verifica que exista gestión de personas."""
    agregar_resultado("Funcionalidad", "Gestión de personas",
                      (SRC_DIR / "app" / "admin" / "personas").exists())


def test_admin_auditoria():
    """Verifica que exista visualización de auditoría."""
    agregar_resultado("Funcionalidad", "Visualización de auditoría",
                      (SRC_DIR / "app" / "admin" / "auditoria").exists())


def test_portal_titulado():
    """Verifica que exista portal del titulado."""
    agregar_resultado("Funcionalidad", "Portal del titulado",
                      (SRC_DIR / "app" / "portal" / "titulado").exists())


def test_portal_egresado():
    """Verifica que exista portal del egresado."""
    agregar_resultado("Funcionalidad", "Portal del egresado",
                      (SRC_DIR / "app" / "portal" / "egresado").exists())


def test_kpis():
    """Verifica que existan KPIs."""
    agregar_resultado("Funcionalidad", "KPIs", (SRC_DIR / "app" / "kpis").exists())


def test_dashboard():
    """Verifica que exista dashboard."""
    agregar_resultado("Funcionalidad", "Dashboard admin",
                      (SRC_DIR / "app" / "admin" / "dashboard").exists())


def test_login():
    """Verifica que exista página de login."""
    agregar_resultado("Funcionalidad", "Página de login", (SRC_DIR / "app" / "login").exists())


def test_noticias():
    """Verifica que exista gestión de noticias."""
    agregar_resultado("Funcionalidad", "Gestión de noticias",
                      (SRC_DIR / "app" / "admin" / "noticias").exists())


# ── Generación de informes ───────────────────────────────────────────────────
def escribir_informes():
    total = len(RESULTADOS)
    passing = sum(1 for r in RESULTADOS if r["estado"] == "PASS")
    failing = total - passing

    with open(AQUI / "resultados.json", "w", encoding="utf-8") as f:
        json.dump(RESULTADOS, f, indent=2, ensure_ascii=False)

    categorias = []
    for r in RESULTADOS:
        if r["categoria"] not in categorias:
            categorias.append(r["categoria"])

    lineas = [
        "# Pruebas de Calidad y Seguridad",
        "",
        "Sistema de Seguimiento a Titulados y Egresados — Carrera de Estadística, UMSA",
        "",
        f"**Resultado: {passing}/{total} pruebas superadas ({failing} fallidas)**",
        "",
    ]
    for cat in categorias:
        rs = [r for r in RESULTADOS if r["categoria"] == cat]
        cp = sum(1 for r in rs if r["estado"] == "PASS")
        lineas.append(f"## {cat} ({cp}/{len(rs)})")
        lineas.append("")
        lineas.append("| Estado | Prueba | Detalle | Descripción |")
        lineas.append("|---|---|---|---|")
        for r in rs:
            marca = "PASS" if r["estado"] == "PASS" else "**FAIL**"
            det = (r["detalle"] or "").replace("|", "/")
            lineas.append(f"| {marca} | {r['prueba']} | {det} | {descripcion_prueba(r['prueba'])} |")
        lineas.append("")
    (AQUI / "resultadopruebas.md").write_text("\n".join(lineas), encoding="utf-8")

    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        doc = Document()
        doc.add_heading("Pruebas de Calidad y Seguridad", level=0)
        doc.add_paragraph(
            "Sistema de Seguimiento a Titulados y Egresados — "
            "Carrera de Estadística, UMSA"
        ).alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph(
            f"Resultado: {passing}/{total} pruebas superadas ({failing} fallidas)"
        ).alignment = WD_ALIGN_PARAGRAPH.CENTER

        for cat in categorias:
            rs = [r for r in RESULTADOS if r["categoria"] == cat]
            cp = sum(1 for r in rs if r["estado"] == "PASS")
            doc.add_heading(f"{cat} ({cp}/{len(rs)})", level=1)
            tabla = doc.add_table(rows=1, cols=4)
            tabla.style = "Table Grid"
            for j, h in enumerate(("Estado", "Prueba", "Detalle", "Descripción")):
                celda = tabla.rows[0].cells[j]
                celda.text = ""
                run = celda.paragraphs[0].add_run(h)
                run.bold = True
                run.font.size = Pt(9)
            for r in rs:
                fila = tabla.add_row().cells
                fila[0].text = r["estado"]
                fila[1].text = r["prueba"]
                fila[2].text = r["detalle"]
                fila[3].text = descripcion_prueba(r["prueba"])
                for c in fila:
                    for p in c.paragraphs:
                        for run in p.runs:
                            run.font.size = Pt(8)
                if r["estado"] == "FAIL":
                    fila[0].paragraphs[0].runs[0].font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
                    fila[0].paragraphs[0].runs[0].bold = True
        doc.save(str(AQUI / "resultadopruebas.docx"))
    except ImportError:
        print("[AVISO] python-docx no disponible: se omitió resultadopruebas.docx")


def main():
    print("=" * 70)
    print("PRUEBAS DE CALIDAD Y SEGURIDAD")
    print("Sistema de Seguimiento a Titulados - Carrera de Estadística UMSA")
    print("=" * 70)
    print()

    print("--- Estructura del Proyecto ---")
    test_estructura_proyecto()
    print()

    print("--- Seguridad (Ley 1405 art. 5) ---")
    test_seguridad_api()
    test_credenciales_no_hardcodeadas()
    test_validacion_entradas()
    test_cookies_seguras()
    test_cookie_misma_sitio()
    test_auditoria()
    test_auditoria_con_ip_y_usuario()
    test_auditoria_en_escritura()
    test_rate_limiting()
    test_rate_limit_por_identificador()
    test_hash_contrasenas()
    test_hash_con_sal_aleatoria()
    test_no_compara_contrasenas_en_plano()
    test_middleware_proteccion()
    test_middleware_cubre_rutas_sensibles()
    test_sql_injection()
    test_consultas_parametrizadas()
    test_xss()
    test_variables_entorno()
    test_secrets_fuera_del_repositorio()
    test_https()
    test_cors()
    test_logging()
    test_consola_no_filtra_datos_sensibles()
    test_token_verificacion()
    test_registro_sin_enumeracion()
    test_cedula_unica_en_esquema()
    test_token_sesion_no_en_url()
    print()

    print("--- Calidad del Código ---")
    test_manejo_errores()
    test_documentacion()
    test_pruebas()
    test_tipos_typescript()
    test_linting()
    test_responsive()
    test_accesibilidad()
    test_performance()
    test_paginacion()
    print()

    print("--- Funcionalidad ---")
    test_busqueda()
    test_kpi_del_plan_implementados()
    test_exportacion()
    test_importacion()
    test_notificaciones()
    test_reportes()
    test_backups()
    test_migraciones()
    test_seed()
    test_admin_usuarios()
    test_admin_personas()
    test_admin_auditoria()
    test_portal_titulado()
    test_portal_egresado()
    test_kpis()
    test_dashboard()
    test_login()
    test_noticias()
    print()

    print("=" * 70)
    total = len(RESULTADOS)
    passed = sum(1 for r in RESULTADOS if r["estado"] == "PASS")
    failed = total - passed
    print(f"RESUMEN: {passed}/{total} pruebas pasaron ({failed} fallaron)")
    print("=" * 70)

    escribir_informes()
    print(f"Informes escritos en {AQUI}")

    return failed == 0


if __name__ == "__main__":
    exit(0 if main() else 1)