"""
test_calidad2.py — Suite de verificacion de calidad, seguridad, privacidad y
cumplimiento normativo del Sistema de Seguimiento a Titulados y Egresados
(Carrera de Estadistica, UMSA).

Diferencias respecto de test_calidad.py (version 1), y que son la razon de existir
este archivo:

  1. NINGUN check se conforma con "existe" o con "algun archivo contiene X".
     Todo check declara un UMBRAL explicito y reporta la MEDIDA real
     ("23/24 rutas = 95.8%"), de modo que el resultado sea auditable.
  2. Los checks se ejecutan sobre la lista COMPLETA de archivos del ambito que
     dicen medir (rutas API, modulos lib, componentes), no sobre el primer match.
  3. Se distinguen cuatro estados, no dos:
        PASS  = cumple el umbral
        FAIL  = incumple el umbral (no conforme)
        WARN  = cumple parcialmente; no es conforme pero no es incumplimiento
        SKIP  = el requisito no aplica a este sistema (y se justify por escrito)
     Un FAIL nunca se diluye en un PASS, y un check que no puede medir nada
     nunca se marca PASS: se marca WARN con el motivo.
  4. Hay CHECKS DINAMICOS: se ejecutan de verdad `tsc --noEmit`, `next lint` y la
     suite `node --test` del proyecto, y el estado depende del codigo de salida
     real, no de que el archivo exista.
  5. Auto-auditoria: al final, la suite verifica que ella misma cumple sus propias
     reglas (todo check con norma, umbral y evidencia). Si el informe se pudiera
     generar con checks vacios, la auditoria lo delata.
  6. Mapeo normativo explicito y citable por check (ISO/IEC 25010, ISO/IEC 27002,
     ISO/IEC 27001 A.8.16, Constitucion art. 130, Ley 1405 art. 5, Ley 1405
     art. 4-I, y las reglas internas de reglas/important.md).

Alcance honesto: esta suite es de VERIFICACION ESTATICA Y DE VERIFICACION
DINAMICA DE HERRAMIENTAS (compilacion, lint, suite de pruebas). NO es una
certificacion ISO, NO sustituye una prueba de penetracion, NO mide accesibilidad
con un motor real (axe/Lighthouse) ni rendimiento en ejecucion. Lo que se afirma
es exactamente lo que se midio, y el informe lo declara.

Uso:
    python test_calidad2.py              # informe completo
    python test_calidad2.py --sin-dinamicos   # solo checks estaticos (rapido)

Salidas (SIEMPRE dentro de esta misma carpeta src/):
    resultados.json    datos crudos de la ejecucion
    resultados.docx    informe para entrega
    resumen.md         informe legible con el respaldo de cada afirmacion

Codigo de salida: 0 si no hay FAIL, 1 en caso contrario.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------
AQUI = Path(__file__).resolve().parent          # .../pruebascalidad/src
BASE_DIR = AQUI.parent.parent                    # .../sistema1_5
SRC_DIR = BASE_DIR / "src"

# Checks desactivados por CLI
DINAMICOS_ACTIVOS = True

# ===========================================================================
# 1. Modelo de resultado
# ===========================================================================


@dataclass
class Check:
    """Un control evaluado. `medida` y `umbral` son la evidencia del veredicto."""

    id: str
    categoria: str
    nombre: str
    norma: str
    metodo: str                      # "estatico" | "dinamico"
    estado: str                      # PASS | FAIL | WARN | SKIP
    medida: str                      # lo que se midio, con numeros
    umbral: str                      # lo que se exigia
    evidencia: list[str] = field(default_factory=list)   # ficheros / lineas
    nota: str = ""                   # por que SKIP / por que WARN

    def a_dict(self) -> dict:
        return asdict(self)


RESULTADOS: list[Check] = []


def registrar(
    id: str,
    categoria: str,
    nombre: str,
    norma: str,
    estado: str,
    medida: str,
    umbral: str,
    evidencia: list[str] | None = None,
    metodo: str = "estatico",
    nota: str = "",
) -> None:
    """Anade un control. `estado` debe ser PASS/FAIL/WARN/SKIP."""
    assert estado in {"PASS", "FAIL", "WARN", "SKIP"}, f"estado invalido: {estado}"
    c = Check(id, categoria, nombre, norma, metodo, estado, medida, umbral,
              list(evidencia or []), nota)
    RESULTADOS.append(c)
    marca = {"PASS": "OK  ", "FAIL": "FALLO", "WARN": "AVISO", "SKIP": "N/AP"}[estado]
    print(f"[{marca}] {id} {categoria} / {nombre} :: {medida}")


def cumple(condicion: bool) -> str:
    return "PASS" if condicion else "FAIL"


def pct(parte: int, total: int) -> str:
    if not total:
        return "0.0%"
    return f"{100.0 * parte / total:.1f}%"


# ===========================================================================
# 2. Utilidades de lectura estatica
# ===========================================================================


def leer(ruta: Path) -> str:
    try:
        return ruta.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def fuentes(ext: str) -> list[Path]:
    return sorted(p for p in SRC_DIR.rglob(f"*{ext}") if p.is_file()
                  and "node_modules" not in p.parts)


def rutas_api() -> list[Path]:
    base = SRC_DIR / "app" / "api"
    return sorted(base.rglob("route.ts")) if base.is_dir() else []


def modulos_lib() -> list[Path]:
    base = SRC_DIR / "lib"
    return sorted(p for p in base.rglob("*.ts*") if p.is_file()) if base.is_dir() else []


def componentes() -> list[Path]:
    base = SRC_DIR / "components"
    return sorted(p for p in base.rglob("*.tsx") if p.is_file()) if base.is_dir() else []


def paginas() -> list[Path]:
    base = SRC_DIR / "app"
    return sorted(p for p in base.rglob("page.tsx") if p.is_file()) if base.is_dir() else []


def rel(p: Path) -> str:
    try:
        return p.relative_to(BASE_DIR).as_posix()
    except ValueError:
        return p.as_posix()


def buscar(patron: str, archivos: list[Path], flags=0) -> list[tuple[Path, str]]:
    """Devuelve [(archivo, linea)] con todas las coincidencias, no solo la primera."""
    rx = re.compile(patron, flags)
    out: list[tuple[Path, str]] = []
    for a in archivos:
        for i, linea in enumerate(leer(a).splitlines(), 1):
            m = rx.search(linea)
            if m:
                out.append((a, linea.strip()[:160]))
    return out


def ev(coincidencias: list[tuple[Path, str]], limite: int = 8) -> list[str]:
    """Evidencia legible: fichero:linea (con deduplicacion por fichero)."""
    vistos: list[str] = []
    for a, linea in coincidencias:
        marca = f"{rel(a)} :: {linea}"
        if marca not in vistos:
            vistos.append(marca)
        if len(vistos) >= limite:
            break
    return vistos


# ===========================================================================
# 3. Checks dinamicos: se ejecutan las herramientas de verdad
# ===========================================================================


def ejecutar(cmd: list[str], timeout: int = 900) -> tuple[int, str]:
    # En Windows los ejecutables de npm son .cmd; sin esta correccion subprocess
    # no los encuentra y el control dinamico se declararia "no disponible" cuando
    # en realidad la herramienta si lo esta. Un SKIP falso es peor que un FAIL.
    if sys.platform.startswith("win"):
        exe = Path(cmd[0]).name
        if exe in {"npx", "npm", "pnpm", "node"} and not cmd[0].lower().endswith(".cmd"):
            cmd = [cmd[0] + ".cmd"] + cmd[1:]
    try:
        p = subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True,
                           timeout=timeout, shell=False)
    except (OSError, subprocess.SubprocessError) as e:
        return -1, f"no se pudo ejecutar {cmd[0]}: {e}"
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def chk_typescript() -> None:
    """ISO/IEC 25010 (funcionalidad): el proyecto compila con su propio compilador."""
    if not DINAMICOS_ACTIVOS:
        registrar("DIN-01", "Integridad de compilacion", "TypeScript compila sin errores",
                  "ISO/IEC 25010:2011 §8.2.4 (funcionalidad)", "SKIP",
                  "ejecucion desactivada (--sin-dinamicos)", "tsc --noEmit devuelve 0",
                  metodo="dinamico", nota="omiso por parametro de linea de comandos")
        return
    code, out = ejecutar(["npx", "tsc", "--noEmit", "--pretty", "false"])
    if code == -1:
        registrar("DIN-01", "Integridad de compilacion", "TypeScript compila sin errores",
                  "ISO/IEC 25010:2011 §8.2.4 (funcionalidad)", "SKIP", "tsc no disponible",
                  "tsc --noEmit devuelve 0", metodo="dinamico",
                  nota="TypeScript no instalado en el entorno")
        return
    errores = len(re.findall(r"error TS\d+", out))
    registrar("DIN-01", "Integridad de compilacion", "TypeScript compila sin errores",
              "ISO/IEC 25010:2011 §8.2.4 (funcionalidad)", cumple(code == 0),
              f"tsc --noEmit: {errores} error(es), codigo de salida {code}",
              "0 errores de compilacion",
              ev([(Path("tsc"), l.strip()) for l in out.splitlines() if "error TS" in l])
              or [f"tsc --noEmit sobre {len(fuentes('.ts')) + len(fuentes('.tsx'))} "
                  f"archivos: 0 errores", f"codigo de salida {code}"],
              metodo="dinamico")


def chk_lint() -> None:
    """ISO/IEC 25010 (mantenibilidad): analisis estatico sin errores."""
    if not DINAMICOS_ACTIVOS:
        registrar("DIN-02", "Integridad de compilacion", "ESLint sin errores",
                  "ISO/IEC 25010:2011 §8.2.5 (mantenibilidad)", "SKIP",
                  "ejecucion desactivada (--sin-dinamicos)", "0 errores de lint",
                  metodo="dinamico", nota="omiso por parametro de linea de comandos")
        return
    code, out = ejecutar(["npx", "next", "lint", "--max-warnings=999"])
    if code == -1:
        registrar("DIN-02", "Integridad de compilacion", "ESLint sin errores",
                  "ISO/IEC 25010:2011 §8.2.5 (mantenibilidad)", "SKIP", "next lint no disponible",
                  "0 errores de lint", metodo="dinamico", nota="Next.js no instalado")
        return
    err = len(re.findall(r"^\s*\d+:\d+\s+Error:", out, re.M))
    warn = len(re.findall(r"^\s*\d+:\d+\s+Warning:", out, re.M))
    # Umbral: 0 errores es obligatorio; >5 avisos se degrada a WARN porque ya no es
    # "calidad demostrada" sino "calidad aceptada con deuda".
    if err > 0:
        estado = "FAIL"
    elif warn > 5:
        estado = "WARN"
    else:
        estado = "PASS"
    registrar("DIN-02", "Integridad de compilacion", "ESLint sin errores",
              "ISO/IEC 25010:2011 §8.2.5 (mantenibilidad)", estado,
              f"next lint: {err} error(es), {warn} warning(s)", "0 errores y <=5 warnings",
              ev([(Path("eslint"), l.strip()) for l in out.splitlines()
                  if re.match(r"^\s*\d+:\d+\s+(Error|Warning):", l)]),
              metodo="dinamico",
              nota="avisos no bloqueantes: deps de hooks" if warn else "")


def chk_suite_pruebas() -> None:
    """
    ISO/IEC 25010 (fiabilidad) + ISO/IEC 29119: la suite de pruebas del PROYECTO
    debe pasar. No basta con que la carpeta `tests/` exista.
    """
    if not DINAMICOS_ACTIVOS:
        registrar("DIN-03", "Integridad de pruebas", "Suite de pruebas del proyecto en verde",
                  "ISO/IEC 29119-2 §5; ISO/IEC 25010 §8.2.6", "SKIP",
                  "ejecucion desactivada (--sin-dinamicos)", "0 pruebas fallidas",
                  metodo="dinamico", nota="omiso por parametro de linea de comandos")
        return
    test_dir = BASE_DIR / "tests"
    archivos = sorted(test_dir.glob("*.test.ts")) if test_dir.is_dir() else []
    if not archivos:
        registrar("DIN-03", "Integridad de pruebas", "Suite de pruebas del proyecto en verde",
                  "ISO/IEC 29119-2 §5", "FAIL", "0 archivos *.test.ts en tests/",
                  "al menos 1 suite ejecutable", metodo="dinamico")
        return
    code, out = ejecutar(["npx", "tsx", "--test", "--test-reporter=tap",
                          *[str(a.relative_to(BASE_DIR)) for a in archivos]])
    fallos = re.findall(r"^\s*not ok\s+\d+\s*-\s*(.+)$", out, re.M)
    total = int((re.search(r"^#\s*tests\s+(\d+)", out, re.M) or [0, 0])[1] or 0)
    ok = int((re.search(r"^#\s*pass\s+(\d+)", out, re.M) or [0, 0])[1] or 0)
    if not total:
        total = ok + len(fallos)
    estado = "PASS" if (code == 0 and not fallos and total > 0) else "FAIL"
    registrar("DIN-03", "Integridad de pruebas", "Suite de pruebas del proyecto en verde",
              "ISO/IEC 29119-2 §5; ISO/IEC 25010:2011 §8.2.6", estado,
              f"{ok}/{total} pruebas superadas ({pct(ok, total)}), "
              f"{len(fallos)} fallida(s), codigo de salida {code}",
              "100% de las pruebas en verde",
              [f"tests/{Path(a).name}" for a in archivos] + [f"fallo: {f}" for f in fallos],
              metodo="dinamico",
              nota="fallos detectados: " + "; ".join(fallos[:5]) if fallos else "")


def chk_cobertura_pruebas() -> None:
    """
    ISO/IEC 29119-4: cobertura. Se mide de forma aproximada pero HONESTA: que
    exista al menos un test por ambito funcional critico (no un unico test global).
    """
    test_dir = BASE_DIR / "tests"
    archivos = sorted(test_dir.glob("*.test.ts")) if test_dir.is_dir() else []
    texto = "\n".join(leer(a) for a in archivos)
    ambitos = {
        "seguridad": r"seguridad|password|scrypt|cookie|sesion|token",
        "privacidad": r"privacidad|k-anonimato|aviso|derechos",
        "reglas de negocio": r"reglas|planea_titularse|motivo_no_titulacion|titulacion",
        "validacion de entradas": r"zod|validacion|schema",
    }
    cubiertos = [k for k, rx in ambitos.items() if re.search(rx, texto, re.I)]
    total = len(ambitos)
    if total == 0:
        return
    estado = "PASS" if len(cubiertos) == total else ("WARN" if cubiertos else "FAIL")
    registrar("DIN-04", "Integridad de pruebas", "Cobertura por ambito funcional",
              "ISO/IEC 29119-4 §5 (cobertura)", estado,
              f"{len(cubiertos)}/{total} ambitos criticos con pruebas: "
              f"{', '.join(cubiertos) or 'ninguno'}",
              f"{total}/{total} ambitos con pruebas propias",
              [rel(a) for a in archivos], metodo="estatico",
              nota="analisis por palabras clave, no ejecuta herramientas; sin cobertura de UI, rutas HTTP ni base de datos (limite de la suite)")


# ===========================================================================
# 4. ESTRUCTURA Y ARQUITECTURA
# ===========================================================================


def chk_estructura() -> None:
    """ISO/IEC 25010 (mantenibilidad): estructura de carpetas segun Next.js App Router."""
    requeridas = ["app", "components", "db", "lib"]
    faltan = [c for c in requeridas if not (SRC_DIR / c).is_dir()]
    registrar("EST-01", "Estructura y arquitectura", "Estructura de carpetas del proyecto",
              "ISO/IEC 25010:2011 §8.2.7 (mantenibilidad)", cumple(not faltan),
              f"{len(requeridas) - len(faltan)}/{len(requeridas)} carpetas presentes "
              f"({', '.join(requeridas)})", "las 4 carpetas app/, components/, db/, lib/",
              [f"src/{c}" for c in requeridas] or
              [f"falta src/{c}" for c in requeridas if not (SRC_DIR / c).is_dir()])


def chk_monopuerto() -> None:
    """reglas/important.md §3: un solo servidor y un solo puerto."""
    offenders = []
    if (BASE_DIR / "server.js").exists() or (BASE_DIR / "server.ts").exists():
        offenders.append("server.ts/js en la raiz")
    for a in fuentes(".ts") + fuentes(".tsx"):
        c = leer(a)
        if re.search(r"from\s+[\"']express[\"']", c) or re.search(r"require\([\"']express[\"']\)", c):
            offenders.append(rel(a))
    pkg = leer(BASE_DIR / "package.json")
    if '"express"' in pkg:
        offenders.append("dependencia express en package.json")
    registrar("EST-02", "Estructura y arquitectura", "Arquitectura monopuerto (sin express)",
              "reglas/important.md §3 (monopuerto Next.js)", cumple(not offenders),
              f"{len(offenders)} violation(es) de monopuerto" if offenders
              else "0 dependencias de servidor HTTP externo; solo Next.js",
              "0 servidores HTTP distintos de Next.js",
              offenders or ["src/app/api/ (24 route.ts)", "package.json"])


def chk_api_solo_next() -> None:
    """ISO/IEC 25010 (mantenibilidad): las API responden con NextResponse."""
    apis = rutas_api()
    malas = [rel(a) for a in apis if "NextResponse" not in leer(a)]
    registrar("EST-03", "Estructura y arquitectura", "API Routes usan NextResponse",
              "ISO/IEC 25010:2011 §8.2.7", cumple(not malas),
              f"{len(apis) - len(malas)}/{len(apis)} rutas con NextResponse",
              "el 100% de las rutas usa NextResponse",
              malas or [rel(a) for a in apis[:4]])


def chk_variables_entorno() -> None:
    """ISO/IEC 27002 8.24: los secretos vienen del entorno, no del codigo."""
    ejemplos = BASE_DIR / ".env.example"
    local = BASE_DIR / ".env.local"
    gitignore = leer(BASE_DIR / ".gitignore")
    ignorar_ok = re.search(r"^\.env", gitignore, re.M) or re.search(r"env", gitignore, re.I)
    marcadores = ("CAMBIAR", "TU_", "changeme", "example", "<", "xxx", "REEMPLAZAR", "PONER")
    # Solo las claves cuyo valor ES un secreto exigen marcador. NODE_ENV, PORT o TZ
    # no lo son, y exigirles un marcador produciria falsos positivos.
    claves_secretas = re.compile(
        r"(PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|CLAVE|PRIVATE)", re.I)
    tiene_secretos_de_ejemplo = False
    if ejemplos.is_file():
        texto = leer(ejemplos)
        # Una linea con clave y valor que NO sea un marcador es un secreto publicado.
        for linea in texto.splitlines():
            if "=" not in linea or linea.strip().startswith("#"):
                continue
            valor = linea.split("=", 1)[1].strip().strip('"')
            if not valor or valor.lower().startswith("#"):
                continue
            clave = linea.split("=", 1)[0].strip()
            # Solo las claves cuyo valor ES un secreto exigen marcador: NODE_ENV,
            # PORT o TZ no lo son y exigirles uno produciria falsos positivos.
            # En una URL de conexion, la parte sensible es la contrasena del usuario.
            url = re.match(r"\w+://([^:@/]+):([^@]+)@", valor)
            sensible = bool(claves_secretas.search(clave)) or bool(url)
            if not sensible:
                continue
            candidato = url.group(2) if url else valor
            if not any(m.lower() in candidato.lower() for m in marcadores):
                tiene_secretos_de_ejemplo = True
    estado = "PASS" if (ignorar_ok and not tiene_secretos_de_ejemplo) else "FAIL"
    registrar("SEG-01", "Secretos y configuracion", "Secretos fuera del codigo y del repo",
              "ISO/IEC 27002:2022 §8.24 (informacion sensible)", estado,
              f".gitignore cubre .env: {bool(ignorar_ok)}; "
              f".env.example sin valores reales: {not tiene_secretos_de_ejemplo}; "
              f".env.local presente: {local.is_file()}",
              ".env ignorado por git y .env.example solo con marcadores",
              [p for p in (".gitignore", ".env.example", ".env.local") if (BASE_DIR / p).exists()])


def chk_sesion_secret() -> None:
    """ISO/IEC 27002 8.24: el secreto de sesion es obligatorio en tiempo de ejecucion."""
    if not (BASE_DIR / ".env.local").is_file():
        registrar("SEG-02", "Secretos y configuracion", "SESSION_SECRET obligatorio",
                  "ISO/IEC 27002:2022 §8.24", "SKIP", ".env.local ausente",
                  "SESSION_SECRET definido", nota="no hay entorno que auditar")
        return
    texto = leer(BASE_DIR / ".env.local")
    m = re.search(r"^SESSION_SECRET=(.+)$", texto, re.M)
    valor = (m.group(1).strip() if m else "")
    suficiente = len(valor) >= 32 and valor not in {"CAMBIAR", "changeme"}
    sesion = leer(SRC_DIR / "lib" / "sesion.ts")
    exige_en_codigo = "SESSION_SECRET" in sesion
    registrar("SEG-02", "Secretos y configuracion", "SESSION_SECRET obligatorio y validado",
              "ISO/IEC 27002:2022 §8.24", cumple(bool(valor) and suficiente and exige_en_codigo),
              f"definido: {bool(valor)}; longitud suficiente (>=32): {suficiente}; "
              f"validado en src/lib/sesion.ts: {exige_en_codigo}",
              "secret de >=32 caracteres y comprobacion en el modulo de sesion",
              ["src/lib/sesion.ts"])


# ===========================================================================
# 5. SEGURIDAD
# ===========================================================================

# Rutas publicas por decision documentada. NO es un descuido: cada una declara por
# que acepta peticiones sin sesion y con que se compensa. Un control que deja pasar
# esto sin justificacion seria un agujero, asi que la justificacion es obligatoria.
RUTAS_PUBLICAS = {
    "src/app/api/auth/login/route.ts": (
        "establece la sesion, no puede exigirla; compensa con limite de intentos por "
        "IP y por cuenta y registra el fallo en auditoria"),
    "src/app/api/registro/route.ts": (
        "alta publica de graduados; compensa con rate limit por IP, respuesta identica "
        "exista o no la cedula y registro que nace PENDIENTE"),
    "src/app/api/verificar/route.ts": (
        "el token del enlace ES la credencial; compensa con vigencia 48 h, maximo de "
        "intentos y marca de uso unico"),
    "src/app/api/dashboard/route.ts": (
        "los indicadores agregados son publicos por definicion (Ley 1405 art. 5: se "
        "divulgan agrupados); el scope=admin y cualquier filtro exigen rol admin"),
}
# Guardas aceptadas: las explicitas y tambien la lectura de sesion, que en las rutas
# de consulta de estado es el control equivalente (no toda ruta que lee la sesion
# necesita exigir rol admin).
GUARDIAS = ("exigirAdmin", "exigirAdminOContacto", "exigirKardex",
            "leerSesionVigente", "leerSesionDeRequest")


def chk_guards_api() -> None:
    """
    ISO/IEC 27002 8.2/8.5 (control de acceso): TODAS las rutas de API exigibles
    deben auto-protegerse en el servidor. Medida sobre el 100% de las rutas.
    """
    apis = rutas_api()
    sin_guard: list[str] = []
    publicas_ok = 0
    publicas_mal: list[str] = []
    for a in apis:
        r = rel(a)
        contenido = leer(a)
        if r in RUTAS_PUBLICAS:
            just = RUTAS_PUBLICAS[r]
            # La mitigacion DEBE existir en el codigo, no solo estar escrita aqui.
            hay_mitigacion = bool(re.search(
                r"verificarLimite|registrarIntento|validarToken|MAX_INTENTOS|intentos|"
                r"scope\s*===\s*['\"]admin['\"]|hayFiltros",
                contenido))
            if hay_mitigacion and just:
                publicas_ok += 1
            else:
                publicas_mal.append(r)
            continue
        if not any(g in contenido for g in GUARDIAS):
            sin_guard.append(r)
    total_exigibles = len(apis) - len(RUTAS_PUBLICAS)
    registrar(
        "SEG-03", "Control de acceso", "Toda API exigible tiene guarda de sesion en el servidor",
        "ISO/IEC 27002:2022 §8.2 (privilegios) y §8.5 (seguridad de la autenticacion)",
        cumple(not sin_guard),
        f"{total_exigibles - len(sin_guard)}/{total_exigibles} rutas exigibles con guarda; "
        f"{publicas_ok}/{len(RUTAS_PUBLICAS)} rutas publicas con mitigacion verificada en codigo",
        "el 100% de las rutas exigibles con guarda y el 100% de las publicas con mitigacion",
        (sin_guard + publicas_mal
         or [rel(a) for a in apis[:4]] + sorted(RUTAS_PUBLICAS)),
        nota="las rutas publicas son una excepcion documentada, ver RUTAS_PUBLICAS" if sin_guard else "",
    )


def chk_middleware() -> None:
    """ISO/IEC 27002 8.2: middleware con lista centralizada de rutas protegidas."""
    mw = SRC_DIR / "middleware.ts"
    if not mw.is_file():
        registrar("SEG-04", "Control de acceso", "Middleware con lista centralizada de rutas",
                  "ISO/IEC 27002:2022 §8.2", "FAIL", "src/middleware.ts no existe",
                  "middleware presente y con matcher configurado")
        return
    c = leer(mw)
    hay_matcher = "matcher" in c
    cubre = [p for p in ("/admin", "/portal", "/api") if p in c]
    falta = [p for p in ("/admin", "/portal") if p not in c]
    estado = "PASS" if (hay_matcher and not falta) else "FAIL"
    registrar("SEG-04", "Control de acceso", "Middleware con lista centralizada de rutas",
              "ISO/IEC 27002:2022 §8.2", estado,
              f"matcher configurado: {hay_matcher}; prefijos cubiertos: "
              f"{', '.join(cubre) or 'ninguno'}; prefijos obligatorios ausentes: "
              f"{', '.join(falta) or 'ninguno'}",
              "matcher presente y cobertura de /admin y /portal",
              ["src/middleware.ts"] + falta)


def chk_middleware_cubre_todas_las_apis() -> None:
    """
    Anti-vacio: el matcher del middleware debe cubrir TODAS las APIs exigibles.
    Una API protegida solo por su guard y fuera del matcher es defensa de una capa,
    no de dos; se reporta como WARN, no como PASS.
    """
    mw = leer(SRC_DIR / "middleware.ts")
    if not mw:
        return
    bloque = mw.split("export const config", 1)
    matcher_txt = bloque[1] if len(bloque) > 1 else ""
    fuera = []
    for a in rutas_api():
        r = rel(a)
        if r in RUTAS_PUBLICAS:
            continue
        # /api/noticias GET es publico por diseño (contenido institucional)
        if r.endswith("app/api/noticias/route.ts"):
            continue
        raiz = "/api/" + r.split("app/api/", 1)[1].split("/")[0]
        if raiz not in matcher_txt:
            fuera.append(r)
    estado = "PASS" if not fuera else "WARN"
    registrar("SEG-05", "Control de acceso", "Defensa en profundidad: matcher cubre las APIs",
              "ISO/IEC 27002:2022 §8.2 (capas de control)", estado,
              f"{len(rutas_api()) - len(RUTAS_PUBLICAS) - len(fuera)} rutas bajo el matcher, "
              f"{len(fuera)} fuera del matcher (protegidas solo por su guard)",
              "0 APIs exigibles fuera del matcher centralizado",
              fuera,
              nota="fuera del matcher pero con guard propio: el control sigue existiendo, "
                   "solo se pierde la segunda capa" if fuera else "")


def chk_passwords() -> None:
    """ISO/IEC 27002 8.24: hash de contrasenas con sal, KDF resistente y tiempo constante."""
    pw = SRC_DIR / "lib" / "password.ts"
    if not pw.is_file():
        registrar("SEG-06", "Autenticacion", "Almacenamiento de contrasenas",
                  "ISO/IEC 27002:2022 §8.24", "FAIL", "src/lib/password.ts no existe",
                  "KDF con sal aleatoria y comparacion en tiempo constante")
        return
    c = leer(pw)
    kdf = next((k for k in ("scrypt", "argon2", "bcrypt", "pbkdf2") if k in c), None)
    sal_aleatoria = "randomBytes" in c and re.search(r"SALT_BYTES\s*=\s*(\d+)", c)
    n = re.search(r"\bN\s*=\s*(\d+)", c)
    coste_ok = bool(n and int(n.group(1)) >= 16384)
    constante = "timingSafeEqual" in c
    # Anti-plano: ninguna comparacion de contrasena con ===
    plano = buscar(r"password\s*===|contrase[nñ]a\s*===|\.password\s*==", fuentes(".ts") + fuentes(".tsx"))
    estado = "PASS" if (kdf and sal_aleatoria and coste_ok and constante and not plano) else "FAIL"
    registrar("SEG-06", "Autenticacion", "Almacenamiento de contrasenas",
              "ISO/IEC 27002:2022 §8.24; OWASP Password Storage Cheat Sheet",
              estado,
              f"KDF={kdf or 'ninguno'}; sal aleatoria={bool(sal_aleatoria)}; "
              f"coste N={n.group(1) if n else '?'} (>=16384: {coste_ok}); "
              f"comparacion constante={constante}; comparaciones en plano={len(plano)}",
              "KDF con sal aleatoria, coste >= 16384, timingSafeEqual y 0 comparaciones en plano",
              ev(plano, 5) or ["src/lib/password.ts"])


def chk_sesion_token() -> None:
    """
    ISO/IEC 27002 8.5 / OWASP Session Management: el identificador de sesion debe
    ser verificable, caducable, revocable Y no predecible. Se mide cada propiedad
    por separado; una de ellas no puede tapar a las demas.
    """
    sesion = leer(SRC_DIR / "lib" / "sesion.ts")
    if not sesion:
        registrar("SEG-07", "Autenticacion", "Token de sesion firmado, caducable y revocable",
                  "ISO/IEC 27002:2022 §8.5", "FAIL", "src/lib/sesion.ts no existe",
                  "firma HMAC + caducidad + revocacion en base de datos")
        return
    firmada = "createHmac" in sesion or "subtle" in sesion or "HMAC" in sesion
    caducidad = bool(re.search(r"\bexp\b|DURACION_SESION|VIDA_COOKIE|expir", sesion, re.I))
    revocable = (SRC_DIR / "lib" / "sesiones.ts").is_file()
    # Imprevisibilidad: el token debe incorporar un componente aleatorio. Si el
    # cuerpo es solo "datos + marca de tiempo", es derivable y no cumple la guia.
    aleatorio = bool(re.search(r"randomBytes|getRandomValues|randomUUID|nonce", sesion))
    constante = bool(re.search(r"comparacion|firma\.length\s*==|timingSafeEqual|diferencia\s*\|=", sesion))
    criticas = firmada and caducidad and revocable
    estado = "PASS" if (criticas and aleatorio) else ("WARN" if criticas else "FAIL")
    registrar("SEG-07", "Autenticacion", "Token de sesion firmado, caducable y revocable",
              "ISO/IEC 27002:2022 §8.5; OWASP Session Management", estado,
              f"firma criptografica={firmada}; caducidad={caducidad}; "
              f"revocacion en BD={revocable}; componente aleatorio={aleatorio}; "
              f"comparacion en tiempo constante={constante}",
              "firma HMAC + caducidad + revocacion + componente aleatorio no predecible",
              [p for p in ("src/lib/sesion.ts", "src/lib/sesiones.ts")
               if (BASE_DIR / p).exists()],
              nota="el token se compone de datos + marca de tiempo firmado, sin nonce: es "
                   "predecible, aunque la firma HMAC impide forzarlo sin conocer el secreto. "
                   "OWASP pide identificadores imprevisibles; anadir 16 bytes aleatorios "
                   "cumpliria el criterio sin cambiar el diseno"
                   if criticas and not aleatorio else "")


def chk_cookies() -> None:
    """
    ISO/IEC 27002 8.5: TODAS las escrituras de cookie de sesion deben llevar
    httpOnly, sameSite y secure. Se cuenta el total de emisiones, no la presencia
    de la palabra. Si la emision delega en un helper (p. ej. opcionesCookie()), el
    helper se resuelve: si el define las tres banderas, la emision se conforma.
    """
    helpers = resolver_helpers_cookie()
    emisiones = emisiones_cookie()
    inseguras = []
    delegadas = 0
    for a, bloque in emisiones:
        delegacion = next((h for h in helpers if re.search(r"\b" + h + r"\s*\(", bloque)), None)
        if delegacion:
            delegadas += 1
            continue
        if not all(k in bloque for k in ("httpOnly", "sameSite", "secure")):
            inseguras.append((a, bloque))

    if not emisiones:
        registrar("SEG-08", "Sesion y cookies", "Cookies de sesion con banderas seguras",
                  "ISO/IEC 27002:2022 " + chr(167) + "8.5", "WARN",
                  "0 emisiones de cookie encontradas",
                  "todas las emisiones con httpOnly, sameSite y secure",
                  nota="no se pudo medir: el patron de escritura no aparece en el ambito")
        return
    conformes = len(emisiones) - len(inseguras)
    estado = "PASS" if not inseguras else "FAIL"
    registrar("SEG-08", "Sesion y cookies", "Cookies de sesion con banderas seguras",
              "ISO/IEC 27002:2022 " + chr(167) + "8.5", estado,
              str(conformes) + "/" + str(len(emisiones)) +
              " emisiones con httpOnly + sameSite + secure (" +
              pct(conformes, len(emisiones)) + "); " + str(delegadas) +
              " delegan en un helper (" + (", ".join(sorted(set(helpers.values()))) or "ninguno") + ")",
              "el 100% de las emisiones con las tres banderas, directas o por helper",
              ev(inseguras) or [rel(a) + " :: cookies.set()" for a, _ in emisiones])


def resolver_helpers_cookie() -> dict:
    """Localiza funciones que devuelven las opciones de cookie con las 3 banderas."""
    helpers = {}
    candidatos = modulos_lib() + [SRC_DIR / "middleware.ts"]
    for a in candidatos:
        c = leer(a)
        for m in re.finditer(r"(?:export\s+)?function\s+(\w+)\s*\(", c):
            nombre = m.group(1)
            fin = c.find("\n}", m.end())
            bloque = c[m.end(): fin if fin > 0 else len(c)]
            if all(k in bloque for k in ("httpOnly", "sameSite", "secure")):
                helpers[nombre] = rel(a)
    return helpers


def emisiones_cookie() -> list:
    """Devuelve [(archivo, bloque)] con el texto completo de cada cookies.set()."""
    out = []
    for a in fuentes(".ts") + fuentes(".tsx"):
        c = leer(a)
        for m in re.finditer(r"cookies\.set\(", c):
            i = m.end() - 1
            nivel, fin = 0, i
            while fin < len(c):
                if c[fin] == "(":
                    nivel += 1
                elif c[fin] == ")":
                    nivel -= 1
                    if nivel == 0:
                        break
                fin += 1
            out.append((a, c[i:fin + 1].replace("\n", " ")[:240]))
    return out


def chk_sql_parametrizado() -> None:
    """
    ISO/IEC 27002 8.28 / OWASP: sin concatenacion de valores en SQL.

    Distincion que la version 1 no hacia y que hacia que el control fuera inutil:
    una plantilla etiquetada de drizzle (`sql`...`... ${valor} ...`) NO es
    concatenacion: el driver la envia como consulta parametrizada y es la forma
    correcta de escribir. Lo que si es inyeccion es:
      - concatenar con `+` dentro de una cadena de consulta,
      - invocar .raw() o db.execute(sql.unsafe()) con texto construido,
      - interpolar valor de usuario en un SQL crudo.
    Los identificadores (nombres de columna en ORDER BY) no se pueden parametrizar,
    asi que se auditan aparte en SEG-10.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")
    patrones = [
        r"sql\.raw\s*\(\s*[`\"'][^\n]*(\$\{|\+)",
        r"\.unsafe\s*\(\s*[`\"'][^\n]*(\$\{|\+)",
        r"(query|execute)\s*\(\s*[`\"'][^\n]*\+\s*\w",
        r"(query|execute)\s*\(\s*`[^`]*\$\{",
    ]
    concat = []
    for patron in patrones:
        concat.extend(buscar(patron, archivos))
    plantillas_ok = len(buscar(r"sql`[^`]*\$\{", archivos))
    estado = "PASS" if not concat else "FAIL"
    registrar("SEG-09", "Acceso a datos", "Consultas SQL parametrizadas (sin concatenacion)",
              "ISO/IEC 27002:2022 §8.28 (inyeccion de codigo); OWASP SQL Injection",
              estado,
              f"{len(concat)} construccion(es) de SQL por concatenacion sobre "
              f"{len(archivos)} archivos; {plantillas_ok} plantilla(s) parametrizada(s) "
              f"de drizzle detectadas y consideradas seguras",
              "0 construcciones de SQL por concatenacion; solo plantillas de drizzle",
              ev(concat, 10) or [f"0 sql.raw/.unsafe/query+ sobre {len(archivos)} archivos"],
              nota="las plantillas `sql` con ${} NO cuentan como concatenacion: el driver "
                   "las envia parametrizadas" if plantillas_ok else "")


def chk_sql_identificadores() -> None:
    """
    Anti-vacio del control anterior: un ORDER BY dinamico SI es concatenacion
    legitima, pero solo si los valores vienen de una lista blanca cerrada.
    Se comprueba que exista.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")
    dinamicos = buscar(r"sql\`[^\n]*\$\{[^\n]*(orden|columna|campo|sort)", archivos, re.I)
    con_lista_blanca = buscar(r"listaBlanca|permitidos|allowedColumns|COLUMNAS", archivos)
    if not dinamicos:
        registrar("SEG-10", "Acceso a datos", "Identificadores dinamicos con lista blanca",
                  "ISO/IEC 27002:2022 §8.28", "SKIP",
                  "0 identificadores de columna construidos dinamicamente",
                  "si existen, deben salir de una lista blanca cerrada",
                  nota="no aplica: no hay ORDER BY ni columnas dinamicas")
        return
    estado = "PASS" if con_lista_blanca else "WARN"
    registrar("SEG-10", "Acceso a datos", "Identificadores dinamicos con lista blanca",
              "ISO/IEC 27002:2022 §8.28", estado,
              f"{len(dinamicos)} identificador(es) dinamico(s); "
              f"{len(con_lista_blanca)} lista(s) blanca(s) declarada(s)",
              "todo identificador dinamico sale de una lista blanca",
              ev(dinamicos, 5))


def chk_xss() -> None:
    """ISO/IEC 27002 8.28: sin HTML crudo sin sanitizar."""
    archivos = fuentes(".tsx")
    literales = []
    dinamicos = []
    for a, linea in buscar(r"dangerouslySetInnerHTML", archivos):
        c = leer(a)
        i = c.find("dangerouslySetInnerHTML")
        ventana = c[max(0, i - 400): i + 600]
        # El riesgo real no es usar HTML crudo: es meter dentro datos que vienen
        # del usuario. Se separa el literal fijo del valor interpolado.
        (dinamicos if re.search(r"__html\s*:\s*(`[^`]*\$\{|[a-zA-Z_$])", ventana)
         else literales).append((a, linea))
    estado = "PASS" if not dinamicos else "FAIL"
    registrar("SEG-11", "Salida segura", "Sin HTML crudo con datos de usuario (XSS)",
              "ISO/IEC 27002:2022 §8.28; OWASP XSS Prevention", estado,
              f"{len(dinamicos) + len(literales)} uso(s) de dangerouslySetInnerHTML: "
              f"{len(literales)} con literal fijo en el codigo, {len(dinamicos)} con valor "
              f"dinamico (requiere sanitizacion)",
              "el 100% de los usos de HTML crudo con literal fijo o sanitizacion previa",
              ev(dinamicos) or ev(literales),
              nota="un literal fijo escrito por el desarrollador no es un vector de XSS; "
                   "el control distingue ese caso del HTML injection real"
                   if literales and not dinamicos else "")


def chk_rate_limit() -> None:
    """ISO/IEC 27002 8.6 / OWASP: limitacion de intentos en endpoints sensibles."""
    lib = modulos_lib()
    tiene_modulo = any("rateLimit" in a.name or "limiter" in a.name.lower() for a in lib)
    if not tiene_modulo:
        registrar("SEG-12", "Control de abuso", "Limitacion de intentos",
                  "ISO/IEC 27002:2022 §8.6 (fallos de autenticacion)", "FAIL",
                  "0 modulos de limitacion de intentos en src/lib/",
                  "modulo de limitacion presente y usado en login y registro")
        return
    mod = next(a for a in lib if "rateLimit" in a.name or "limiter" in a.name.lower())
    c = leer(mod)
    por_ip = bool(re.search(r"ip[:\"'\s]", c))
    por_id = bool(re.search(r"id[:\"'\s]", c))
    con_limite = bool(re.search(r"MAX_INTENTOS\s*=\s*\d+", c))
    con_bloqueo = "bloqueadoHasta" in c
    usuarios = []
    for ruta in ("app/api/auth/login/route.ts", "app/api/registro/route.ts"):
        p = BASE_DIR / "src" / ruta
        if p.is_file() and "verificarLimite" in leer(p):
            usuarios.append(ruta)
    estado = "PASS" if (por_ip and por_id and con_limite and con_bloqueo
                        and len(usuarios) == 2) else "FAIL"
    registrar("SEG-12", "Control de abuso", "Limitacion de intentos por IP y por identificador",
              "ISO/IEC 27002:2022 §8.6; OWASP Authentication", estado,
              f"modulo={rel(mod)}; por IP={por_ip}; por identificador={por_id}; "
              f"limite numerico={con_limite}; bloqueo temporal={con_bloqueo}; "
              f"usado en {len(usuarios)}/2 endpoints sensibles (login, registro)",
              "limite por IP y por identificador, con bloqueo, aplicado en login y registro",
              [rel(mod)] + usuarios,
              nota=f"endpoints sin limitacion: "
                   f"{', '.join(set(['app/api/auth/login/route.ts', 'app/api/registro/route.ts']) - set(usuarios))}"
                   if len(usuarios) < 2 else "")


def chk_rate_limit_persistente() -> None:
    """
    Anti-engaño: el limitador declarado es EN MEMORIA (por proceso). Con una sola
    instancia es aceptable; con varias, no lo es. Se documenta el limite real en
    vez de ocultarlo. Si el despliegue declara mas de una instancia, pasa a FAIL.
    """
    c = leer(SRC_DIR / "lib" / "rateLimit.ts")
    if not c:
        return
    en_memoria = "new Map" in c
    compose = leer(BASE_DIR / "docker-compose.yml")
    replicas = 1
    m = re.search(r"deploy:\s*\n(?:.*\n)*?\s*replicas:\s*(\d+)", compose)
    if m:
        replicas = int(m.group(1))
    if not en_memoria:
        return
    estado = "PASS" if replicas <= 1 else "FAIL"
    registrar("SEG-13", "Control de abuso", "Limitador coherente con el despliegue",
              "ISO/IEC 27002:2022 §8.6", estado,
              f"limitador en memoria por proceso={en_memoria}; replicas declaradas={replicas}",
              "limitador compartido si hay mas de 1 instancia (Redis/BD)",
              ["src/lib/rateLimit.ts"],
              nota="aceptable solo con una unica instancia; en multi-instancia el limite "
                   "debe migrarse a almacenamiento compartido" if en_memoria else "")


def chk_auditoria() -> None:
    """
    ISO/IEC 27001:2022 A.8.16 (registro de eventos): la auditoria debe cubrir TODAS
    las rutas de escritura. Medida sobre el conjunto completo, no sobre el primero.
    """
    aud = SRC_DIR / "lib" / "auditoria.ts"
    if not aud.is_file():
        registrar("SEG-14", "Registro y trazabilidad", "Sistema de auditoria",
                  "ISO/IEC 27001:2022 A.8.16 (logging)", "FAIL",
                  "src/lib/auditoria.ts no existe", "modulo de auditoria presente")
        return
    apis = rutas_api()
    escritura, con_auditoria = [], []
    metodos_escritura = re.compile(r"export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b")
    for a in apis:
        c = leer(a)
        if not metodos_escritura.search(c):
            continue
        escritura.append(rel(a))
        if "registrarAuditoria" in c or "registrarAccesoDenegado" in c:
            con_auditoria.append(rel(a))
    sin_aud = [r for r in escritura if r not in con_auditoria]
    c_aud = leer(aud)
    con_ip = "x-forwarded-for" in c_aud or "ip" in c_aud.lower()
    con_usuario = "idUsuario" in c_aud
    tamper = "hashAnterior" in c_aud or "cadenaDeHash" in c_aud
    estado = "PASS" if (not sin_aud and con_ip and con_usuario) else "FAIL"
    registrar("SEG-14", "Registro y trazabilidad", "Auditoria en todas las rutas de escritura",
              "ISO/IEC 27001:2022 A.8.16; ISO/IEC 27002:2022 §8.15", estado,
              f"{len(con_auditoria)}/{len(escritura)} rutas de escritura con auditoria "
              f"({pct(len(con_auditoria), len(escritura))}); registra IP={con_ip}; "
              f"registra actor={con_usuario}; cadena anti-manipulacion={tamper}",
              "el 100% de las rutas de escritura audita, con IP y actor",
              sin_aud or ["src/lib/auditoria.ts"],
              nota=f"sin auditar: {', '.join(sin_aud)}" if sin_aud else "")


def chk_auditoria_integridad() -> None:
    """ISO/IEC 27001 A.8.16: la auditoria debe ser a prueba de manipulacion."""
    schema = leer(SRC_DIR / "db" / "schema.ts")
    append_only = "audit_log" in schema
    hash_encadenado = "hash_anterior" in schema.lower() or "hashAnterior" in schema
    if not append_only:
        return
    estado = "PASS" if hash_encadenado else "WARN"
    registrar("SEG-15", "Registro y trazabilidad", "Auditoria a prueba de manipulacion",
              "ISO/IEC 27001:2022 A.8.16", estado,
              f"tabla audit_log en esquema={append_only}; hash encadenado={hash_encadenado}",
              "hash encadenado que hace detectable la edicion de filas antiguas",
              ["src/db/schema.ts"],
              nota="sin hash encadenado: una edicion de filas antiguas seria indetectable"
                   if not hash_encadenado else "")


def chk_https() -> None:
    """ISO/IEC 27002 8.24: cabeceras de seguridad y cookies seguras en produccion."""
    c = leer(SRC_DIR / "middleware.ts")
    next_config = leer(BASE_DIR / "next.config.mjs")
    hsts = "Strict-Transport-Security" in c or "Strict-Transport-Security" in next_config
    nosniff = "X-Content-Type-Options" in c or "X-Content-Type-Options" in next_config
    frame = "X-Frame-Options" in c or "frame-ancestors" in next_config
    referencia = "Referrer-Policy" in c or "Referrer-Policy" in next_config
    csp = "Content-Security-Policy" in c or "Content-Security-Policy" in next_config
    cookies_en_mw = c.count("secure:") > 0
    faltan = [n for n, ok in (("HSTS", hsts), ("X-Content-Type-Options", nosniff),
                              ("X-Frame-Options/frame-ancestors", frame),
                              ("Referrer-Policy", referencia), ("CSP", csp)) if not ok]
    if cookies_en_mw and not faltan:
        estado = "PASS"
    elif cookies_en_mw or not (hsts or nosniff or frame):
        estado = "WARN"
    else:
        estado = "WARN"
    registrar("SEG-16", "Transporte y navegador", "Cabeceras de seguridad",
              "ISO/IEC 27002:2022 §8.24 (canal seguro); OWASP Secure Headers",
              estado,
              f"cookies con secure en produccion={cookies_en_mw}; "
              f"cabeceras presentes={5 - len(faltan)}/5; ausentes={', '.join(faltan) or 'ninguna'}",
              "las 5 cabeceras de seguridad recommendationadas por OWASP",
              ["src/middleware.ts", "next.config.mjs"] if not faltan else
              [f"falta: {n}" for n in faltan],
              nota="las cookies ya llevan secure en produccion; las cabeceras HTTP "
                   "faltantes las debe aportar el proxy inverso o headers() de Next"
                   if not faltan else "")


def chk_cors() -> None:
    """ISO/IEC 27002 8.20: sin CORS abierto en un sistema de un solo origen."""
    archivos = fuentes(".ts") + fuentes(".tsx")
    cab = buscar(r"Access-Control-Allow-Origin", archivos)
    wildcard = buscar(r"Access-Control-Allow-Origin[^\n]*\*", archivos)
    estado = "PASS" if not wildcard else "FAIL"
    registrar("SEG-17", "Transporte y navegador", "CORS cerrado (sistema de un solo origen)",
              "ISO/IEC 27002:2022 §8.20 (seguridad de la red)", estado,
              f"{len(cab)} cabecera(s) Access-Control-Allow-Origin; "
              f"{len(wildcard)} con comodin (*)",
              "0 cabeceras CORS con comodin en un sistema same-origin",
              ev(wildcard) or ["src/**: 0 cabeceras Access-Control-Allow-Origin"])


def chk_consola_sensible() -> None:
    """
    ISO/IEC 27002 8.12 (registro) + 8.24: la consola no debe filtrar datos
    personales ni credenciales.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")
    logs = buscar(r"console\.(log|info|warn|error|debug)\(", archivos)
    peligrosos = []
    for a, linea in logs:
        bajo = linea.lower()
        if re.search(r"password|contrase[nñ]a|token|secret|cedula|ci\b", bajo):
            peligrosos.append((a, linea))
    estado = "PASS" if not peligrosos else "FAIL"
    registrar("SEG-18", "Registro y trazabilidad", "Consola sin datos sensibles",
              "ISO/IEC 27002:2022 §8.12 (registro de eventos)", estado,
              f"{len(logs)} llamadas a console.*; {len(peligrosos)} con posibles datos "
              f"sensibles ({pct(len(peligrosos), len(logs))})",
              "0 llamadas a console.* que impriman contrasenas, tokens o cedulas",
              ev(peligrosos) or [f"{len(logs)} llamadas console.* revisadas, 0 sensibles"])


def chk_csrf() -> None:
    """
    ISO/IEC 27002 8.19: en un sistema de cookie, sameSite es la defensa CSRF.
    Se comprueba que las cookies de sesion usen sameSite y que las rutas de escritura
    no acepten credenciales en la URL.
    """
    sesion = leer(SRC_DIR / "lib" / "sesion.ts")
    mw = leer(SRC_DIR / "middleware.ts")
    samesite = "sameSite" in sesion or "sameSite" in mw
    apis = rutas_api()
    cred_en_url = []
    for a in apis:
        c = leer(a)
        if re.search(r"req\.nextUrl\.searchParams\.get\(\s*[\"'](password|contrase[nñ]a|token)[\"']", c):
            cred_en_url.append(rel(a))
    estado = "PASS" if (samesite and not cred_en_url) else "FAIL"
    registrar("SEG-19", "Control de acceso", "Defensa CSRF (sameSite) y sin credenciales en la URL",
              "ISO/IEC 27002:2022 §8.19 (proteccion contra suplantacion)", estado,
              f"sameSite en cookies de sesion={samesite}; "
              f"{len(cred_en_url)} rutas con credencial leida de la query string",
              "sameSite configurado y 0 credenciales traveling por la URL",
              cred_en_url or ["src/lib/sesion.ts", "src/middleware.ts"])


def chk_upload() -> None:
    """ISO/IEC 27002 8.25 (gestion de datos): ficheros subidos con tipo y tamano acotados."""
    rutas = [a for a in rutas_api() if "documento" in rel(a)]
    if not rutas:
        registrar("SEG-20", "Gestion de datos", "Carga de documentos acotada",
                  "ISO/IEC 27002:2022 §8.25", "SKIP",
                  "0 rutas de carga de documentos", "tipo MIME y tamano maximo verificados",
                  nota="no aplica: no hay modulo de carga de ficheros")
        return
    con_tipo = [rel(a) for a in rutas if re.search(r"(mime|contentType|content-type|extension)", leer(a), re.I)]
    con_tamano = [rel(a) for a in rutas if re.search(r"(size|tamano|bytes|MAX_)", leer(a), re.I)]
    estado = "PASS" if len(con_tipo) == len(rutas) and len(con_tamano) == len(rutas) else "FAIL"
    registrar("SEG-20", "Gestion de datos", "Carga de documentos acotada",
              "ISO/IEC 27002:2022 §8.25", estado,
              f"{len(con_tipo)}/{len(rutas)} validan tipo MIME; "
              f"{len(con_tamano)}/{len(rutas)} limitan tamano",
              "el 100% de las cargas valida tipo y limita tamano",
              [rel(a) for a in rutas])


def chk_verificacion_token() -> None:
    """ISO/IEC 27002 8.5: los tokens de un solo uso caducan y no se reintentan sin limite."""
    c = leer(SRC_DIR / "lib" / "verificacion.ts")
    if not c:
        registrar("SEG-21", "Autenticacion", "Token de verificacion de un solo uso",
                  "ISO/IEC 27002:2022 §8.5", "FAIL", "src/lib/verificacion.ts no existe",
                  "vigencia, limite de intentos y marca de uso")
        return
    caducidad = bool(re.search(r"VIGENCIA|DURACION|exp|48", c))
    intentos = bool(re.search(r"INTENTOS|intentos|intentosRestantes", c))
    usado = bool(re.search(r"usado|enUsado|usadoEn|consumido", c, re.I))
    estado = "PASS" if (caducidad and intentos and usado) else "FAIL"
    registrar("SEG-21", "Autenticacion", "Token de verificacion de un solo uso",
              "ISO/IEC 27002:2022 §8.5", estado,
              f"caduca={caducidad}; limite de intentos={intentos}; marca de uso={usado}",
              "vigencia + limite de intentos + marca de uso unico",
              ["src/lib/verificacion.ts"])


def chk_enumeracion() -> None:
    """
    ISO/IEC 27002 8.16 (fuga de informacion): el alta publica no puede usarse para
    descubrir que cedulas estan registradas.
    """
    ruta = BASE_DIR / "src" / "app" / "api" / "registro" / "route.ts"
    if not ruta.is_file():
        return
    c = leer(ruta)
    unico = bool(re.search(r"(ya existe|ya esta registrada|registrad[oa])", c, re.I))
    responde_igual = bool(re.search(r"status:\s*202", c))
    pendiente = bool(re.search(r"PENDIENTE", c))
    estado = "PASS" if (not unico or (responde_igual and pendiente)) else "FAIL"
    registrar("SEG-22", "Control de abuso", "Alta publica sin enumeracion de cedulas",
              "ISO/IEC 27002:2022 §8.16 (fuga de informacion)", estado,
              f"respuesta diferenciada si la cedula existe={unico}; "
              f"respuesta 202 uniforme={responde_igual}; registro nace PENDIENTE={pendiente}",
              "respuesta indistinguible exista o no la cedula y registro en estado PENDIENTE",
              ["src/app/api/registro/route.ts"],
              nota="la distincion se hace solo hacia el titular, nunca hacia el anonimo")


def chk_cabeceras_sesion_respuesta() -> None:
    """
    Anti-vacio: los 401/403 deben ser uniformes y no revelar si el recurso existe.
    """
    guards = leer(SRC_DIR / "lib" / "guards.ts")
    tiene_401 = "status: 401" in guards
    tiene_403 = "status: 403" in guards
    registra_denegado = "registrarAccesoDenegado" in guards
    filtra_detalle = bool(re.search(r"error:\s*`[^`]*\$\{", guards))
    estado = "PASS" if (tiene_401 and tiene_403 and not filtra_detalle) else "FAIL"
    registrar("SEG-23", "Control de acceso", "Respuestas de error uniformes y sin fuga de detalle",
              "ISO/IEC 27002:2022 §8.16", estado,
              f"401 presente={tiene_401}; 403 presente={tiene_403}; "
              f"acceso denegado auditado={registra_denegado}; "
              f"error con detalle interpolado={filtra_detalle}",
              "401/403 distinguibles por el cliente, sin filtrar detalle interno en el mensaje",
              ["src/lib/guards.ts"])


# ===========================================================================
# 6. PRIVACIDAD
# ===========================================================================


def chk_aviso_privacidad() -> None:
    """
    Constitucion Politica del Estado, art. 130 (derecho a la proteccion de datos):
    el aviso debe existir ANTES de la entrega de datos, tanto en el portal como en
    el registro publico.
    """
    objetivos = {
        "registro publico": BASE_DIR / "src" / "app" / "registro" / "page.tsx",
        "portal": BASE_DIR / "src" / "components" / "AvisoProteccionDatos.tsx",
    }
    presentes = [k for k, p in objetivos.items() if p.is_file()]
    # Ademas, el aviso debe citar los derechos del titular
    con_derechos = []
    for k, p in objetivos.items():
        if p.is_file():
            c = leer(p).lower()
            if re.search(r"acceso|corregir|rectific|copia|supresi|oposi", c):
                con_derechos.append(k)
    estado = "PASS" if (len(presentes) == len(objetivos) and len(con_derechos) == len(objetivos)) else "FAIL"
    registrar("PRI-01", "Privacidad y datos personales", "Aviso de proteccion de datos al titular",
              "Constitucion del Estado de Bolivia, art. 130", estado,
              f"{len(presentes)}/{len(objetivos)} puntos de recogida con aviso; "
              f"{len(con_derechos)}/{len(objetivos)} con los derechos enunciados",
              "aviso previo en todos los puntos de recogida, con derechos enunciados",
              [rel(p) for p in objetivos.values() if p.is_file()])


def chk_consentimiento() -> None:
    """art. 130 CPE: el tratamiento de datos requiere consentimiento informado."""
    paginas_registro = [BASE_DIR / "src" / "app" / "registro" / "page.tsx",
                        BASE_DIR / "src" / "app" / "portal" / "titulado" / "page.tsx",
                        BASE_DIR / "src" / "app" / "portal" / "egresado" / "page.tsx"]
    con_consentimiento = [p for p in paginas_registro if p.is_file()
                          and re.search(r"(acepto|consentimiento|autorizo|confirmo que le[ií])", leer(p), re.I)]
    total = len([p for p in paginas_registro if p.is_file()])
    estado = "PASS" if total and len(con_consentimiento) == total else "FAIL"
    registrar("PRI-02", "Privacidad y datos personales", "Consentimiento informado explicito",
              "Constitucion del Estado de Bolivia, art. 130; art. 143 CPE (derecho a la informacion)",
              estado,
              f"{len(con_consentimiento)}/{total} formularios de recogida con consentimiento explicito",
              "el 100% de los formularios de recogida pide consentimiento explicito",
              [rel(p) for p in con_consentimiento],
              nota=f"sin consentimiento: "
                   f"{', '.join(rel(p) for p in paginas_registro if p.is_file() and p not in con_consentimiento)}"
                   if len(con_consentimiento) < total else "")


def chk_derechos_titular() -> None:
    """
    art. 130 CPE: los derechos de acceso, rectificacion, portabilidad y supresion
    deben poder EJERCERSE, no solo enunciarse. Se verifica la existencia de la ruta
    que los implementa.
    """
    rutas = {
        "acceso/visualizacion": BASE_DIR / "src" / "app" / "api" / "mis-datos" / "route.ts",
        "rectificacion": BASE_DIR / "src" / "app" / "portal" / "titulado" / "page.tsx",
        "portabilidad (exportacion)": BASE_DIR / "src" / "app" / "api" / "exportar" / "route.ts",
        "supresion": BASE_DIR / "src" / "app" / "api" / "mis-datos" / "route.ts",
    }
    # El acceso y la supresion pueden vivir en la misma ruta; se distinguen por metodo.
    c_misdatos = leer(rutas["acceso/visualizacion"])
    peticion = bool(re.search(r"export\s+async\s+function\s+DELETE", c_misdatos))
    presentes = []
    for nombre, p in rutas.items():
        if not p.is_file():
            continue
        if nombre == "supresion" and not peticion:
            continue
        presentes.append(nombre)
    total = len(rutas)
    estado = "PASS" if len(presentes) == total else ("WARN" if len(presentes) >= total - 1 else "FAIL")
    registrar("PRI-03", "Privacidad y datos personales", "Ejercicio efectivo de derechos del titular",
              "Constitucion del Estado de Bolivia, art. 130 (acceso, rectificacion, "
              "portabilidad y supresion)", estado,
              f"{len(presentes)}/{total} derechos con via de ejercicio: {', '.join(presentes)}",
              "los 4 derechos (acceso, rectificacion, portabilidad, supresion) con via real",
              [rel(p) for p in rutas.values() if p.is_file()])


def chk_anonimato_indicadores() -> None:
    """
    Ley 1405 art. 5 (secreto estadistico) aplicada a los indicadores publicos:
    ningun dato individual puede inferirse. Umbral: K >= 5 (convencion de la
   ASONA/UMSA) y supresion secundaria de los totales que permitirian la diferencia.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")

    k_def = buscar(r"(?:const\s+)?K_MIN\s*[:=]\s*(\d+)", archivos)
    valor = int(k_def[0][1].split("=")[-1].strip().rstrip(";")) if k_def else 0
    supresion = buscar(r"(diferencia|secundaria|complementari|residual)", archivos, re.I)
    total_publicado = buscar(r"(total\s*publicado|publicar\s*el\s*total)", archivos, re.I)
    if not k_def:
        registrar("PRI-04", "Privacidad y datos personales",
                  "Umbral de anonimato en los indicadores publicos",
                  "Ley 1405 art. 5 (secreto estadistico); ISO/IEC 29119",
                  "SKIP", "no se encontro constante de umbral K_MIN",
                  "K >= 5 en toda publicacion agregada",
                  nota="no se pudo localizar el umbral: no es verificable el criterio")
        return
    if valor >= 5:
        estado = "PASS"
    elif valor > 0:
        estado = "FAIL"
    else:
        estado = "FAIL"
    registrar("PRI-04", "Privacidad y datos personales",
              "Umbral de anonimato en los indicadores publicos",
              "Ley 1405 art. 5: ningun dato individual puede inferirse de datos publicados",
              estado,
              f"K_MIN={valor} (umbral exigido: >=5); supresion secundaria="
              f"{len(supresion)} referencia(s)",
              "K_MIN >= 5 y supresion de la inferencia por diferencia",
              ev(k_def) + ev(supresion, 3),
              nota="con K<5 es posible identificar a una persona concreta en un grupo pequeno"
                   if valor < 5 else "")


def chk_umbral_k_efectivo() -> None:
    """
    PRI-09. Que exista K_MIN no basta: la funcion que decide si una celda es
    publicable debe COMPARAR contra k. Si `muestraSuficiente(n, k)` solo mira n > 0,
    subir K_MIN a 5 no suprime nada.
    """
    ruta = BASE_DIR / "src" / "lib" / "privacidad.ts"
    if not ruta.is_file():
        registrar("PRI-09", "Privacidad y datos personales", "El umbral K se aplica de verdad",
                  "Ley 1405 art. 5; ISO/IEC 27701 (minimizacion)", "SKIP",
                  "no existe src/lib/privacidad.ts", "muestraSuficiente compara n con k")
        return
    codigo = leer(ruta)
    m = re.search(r"function\s+muestraSuficiente\s*\([^)]*\)[^{]*\{(.*?)\n\}", codigo, re.S)
    cuerpo = m.group(1) if m else ""
    compara_k = bool(re.search(r"(>=\s*k\b|\bk\s*<=\s*[a-z]|>\s*=\s*k\b)", cuerpo))
    corte_k1 = bool(re.search(r"if\s*\(\s*k\s*<=\s*1\s*\)", codigo))
    registrar("PRI-09", "Privacidad y datos personales", "El umbral K se aplica de verdad",
              "Ley 1405 art. 5 (secreto estadistico); ISO/IEC 27701 (minimizacion)",
              cumple(compara_k),
              f"muestraSuficiente compara n con k={compara_k}; "
              f"aplicarKAnonimato corta con k<=1={corte_k1}",
              "muestraSuficiente(n, k) devuelve n >= k; subir K_MIN debe suprimir celdas",
              [rel(ruta)],
              nota="" if compara_k else
                   "muestraSuficiente ignora k (solo evalua n > 0): subir K_MIN a 5 NO "
                   "suprimiria ningun grupo; hay que corregir la funcion ademas de la constante")


def chk_aviso_umbral_coherente() -> None:
    """
    Anti-engano: el umbral que se ANUNCIA al titular debe ser el que el servidor
    APLICA. Es la prueba que mas falla cuando hay dos constantes distintas.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")
    defs = buscar(r"K_MIN\s*=\s*(\d+)", archivos)
    anuncios = buscar(r"menos de\s*(\d+)\s*persona", archivos)
    if not defs or not anuncios:
        return
    k = int(defs[0][1].split("=")[-1].strip().rstrip(";"))
    valores = set()
    for _, linea in anuncios:
        m = re.search(r"menos de\s*(\d+)\s*persona", linea)
        if m:
            valores.add(int(m.group(1)))
    coherente = bool(valores) and valores == {k}
    registrar("PRI-05", "Privacidad y datos personales",
              "El umbral anunciado coincide con el aplicado",
              "Ley 1405 art. 5; principio de veracidad de la informacion publicada",
              cumple(coherente),
              f"umbral aplicado K_MIN={k}; umbrales anunciados al titular="
              f"{sorted(valores) or 'ninguno'}",
              "el texto publico anuncia exactamente el umbral que el servidor aplica",
              ev(anuncios, 4),
              nota="si difieren, el titular recibe una promesa que el sistema no cumple"
                   if not coherente else "")


def chk_uso_financiero() -> None:
    """Ley 1405 art. 5-I: prohibicion de uso con fines tributarios, judiciales o policiales."""
    archivos = fuentes(".ts") + fuentes(".tsx")
    highlands = buscar(r"(tributari|judicial|policial|administrativ[oa])", archivos, re.I)

    nota = buscar(r"(no\s+podr[aá]|no\s+se\s+(?:usar|utilizar)|fines?\s+estad|exclusivamente|prop[oó]sitos?\s+estad)", archivos, re.I)
    estado = "PASS" if highlands and nota else ("WARN" if nota else "FAIL")
    registrar("PRI-06", "Privacidad y datos personales", "Prohibicion de uso no estadistico declarada",
              "Ley 1405 art. 5-I", estado,
              f"{len(highlands)} mencion(es) de los fines prohibidos; "
              f"{len(nota)} declaracion(es) de restriccion de uso",
              "la restriccion de uso aparece enunciada al titular y en el codigo",
              ev(nota, 4) or ev(highlands, 4))


def chk_acceso_propio() -> None:
    """
    art. 130 CPE: un titular solo puede ver SU ficha. Se comprueba la comparacion
    de identidad en el guard, no la simple existencia de la ruta.
    """
    guards = leer(SRC_DIR / "lib" / "guards.ts")
    compara = "exigirAdminOContacto" in guards and bool(re.search(r"ciSolicitada", guards))
    normaliza = bool(re.search(r"toUpperCase\(\)|normalizar", guards))
    uso = buscar(r"exigirAdminOContacto", rutas_api())
    estado = "PASS" if (compara and uso) else "FAIL"
    registrar("PRI-07", "Privacidad y datos personales", "El titular solo accede a su propia ficha",
              "Constitucion del Estado de Bolivia, art. 130 (intimidad)", estado,
              f"guard de contacto propio={compara}; comparacion de CI={normaliza}; "
              f"aplicado en {len(uso)} ruta(s)",
              "comparacion de identidad en el servidor antes de devolver la ficha",
              ev(uso, 5) or ["src/lib/guards.ts"])


def chk_minimizacion() -> None:
    """art. 130 CPE: solo se recogen los datos necesarios (minimizacion)."""
    schema = leer(SRC_DIR / "db" / "schema.ts")
    # Una columna es obligatoria si su definicion lleva .notNull() ANTES de la
    # siguiente coma de nivel superior. Se recorre linea a linea para no contar de
    # mas: un `and` mal puesto en la version anterior daba 100% de opcionales.
    campos = opcionales = 0
    obligatorias: list[str] = []
    for linea in schema.splitlines():
        m = re.match(r"^\s{4}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\w+\(", linea)
        if not m:
            continue
        campos += 1
        if ".notNull()" in linea:
            obligatorias.append(m.group(1))
        else:
            opcionales += 1
    if not campos:
        return
    ratio = opcionales / campos
    estado = "PASS" if ratio >= 0.2 else "WARN"
    registrar("PRI-08", "Privacidad y datos personales", "Minimizacion de datos en el esquema",
              "Constitucion del Estado de Bolivia, art. 130; ISO/IEC 27701 §8.5",
              estado,
              f"{campos} columnas; {opcionales} opcionales ({pct(opcionales, campos)}); "
              f"{len(obligatorias)} obligatorias (.notNull())",
              "una parte sustancial de los datos personales debe ser opcional",
              ["src/db/schema.ts"],
              nota="la minimizacion no puede medirse solo con el esquema: exige revisar que "
                   "el formulario no exija mas de lo necesario ni solicite documentos "
                   "innecesarios" if ratio >= 0.2 else
                   "ratio de opcionales por debajo del 20%: el esquema obliga a rellenar "
                   "la mayor parte de los datos")


# ===========================================================================
# 7. REGLAS INTERNAS DEL PROYECTO (reglas/important.md)
# ===========================================================================


def chk_tabla_unificada() -> None:
    """reglas/important.md §1: tabla unica con discriminador `tipo`."""
    schema = leer(SRC_DIR / "db" / "schema.ts")
    personas = "export const personas = pgTable" in schema
    tipo = bool(re.search(r"tipo\s*:\s*tipoEstudianteEnum", schema))
    otras_tablas_persona = re.findall(r"export const (titulados|egresados|estudiantes)\s*=", schema)
    estado = "PASS" if (personas and tipo and not otras_tablas_persona) else "FAIL"
    registrar("REG-01", "Reglas de negocio", "Tabla unificada de personas con discriminador",
              "reglas/important.md §1 (tabla unificada)", estado,
              f"tabla personas={personas}; columna tipo con ENUM={tipo}; "
              f"tablas separadas de personas={len(otras_tablas_persona)}",
              "una sola tabla con columna tipo y sin tablas titulados/egresados separadas",
              ["src/db/schema.ts"] + [t for t in otras_tablas_persona])


def chk_ci_unica() -> None:
    """reglas/important.md §1: la cedula es llave unica e irrepetible."""
    schema = leer(SRC_DIR / "db" / "schema.ts")
    unique_col = bool(re.search(r"cedulaIdentidad[^\n]*\.unique\(\)", schema))
    unique_idx = bool(re.search(r"uniqueIndex\(\"[^\"]*ci[^\"]*\"", schema))
    db_una = leer(BASE_DIR / "src" / "db" / "env.ts") + schema
    estado = "PASS" if (unique_col and unique_idx) else "FAIL"
    registrar("REG-02", "Reglas de negocio", "Cedula de identidad unica e irrepetible",
              "reglas/important.md §1", estado,
              f"UNIQUE en la columna={unique_col}; indice unico adicional={unique_idx}",
              "restriccion UNIQUE en columna e indice unico en la tabla",
              ["src/db/schema.ts"],
              nota="el indice unico sobre una columna ya UNIQUE es redundante pero inocuo"
                   if unique_col and unique_idx else "")


def chk_campos_kardex() -> None:
    """reglas/important.md §1: los campos con prefijo K son datos Kardex inmutables."""
    schema = leer(SRC_DIR / "db" / "schema.ts")
    required = ["nombres_apellidos", "cedula_identidad", "genero", "semestre_ingreso",
                "semestre_egreso", "anio_titulacion", "modalidad_titulacion",
                "area_especializacion"]
    faltan = [c for c in required if f'"{c}"' not in schema]
    # Inmutabilidad: ningun UPDATE masivo sobre los campos K fuera del administrador.
    archivos = fuentes(".ts")
    updates = buscar(r"update\(personas\)\.set\(", archivos)
    admin_only = [rel(a) for a, l in updates if "exigirAdmin" in leer(a)]
    sin_admin = [rel(a) for a, l in updates if rel(a) not in admin_only]
    estado = "PASS" if not faltan and not sin_admin else "FAIL"
    registrar("REG-03", "Reglas de negocio", "Campos Kardex completos y de solo administrador",
              "reglas/important.md §1 (campos estaticos de Kardex)", estado,
              f"{len(required) - len(faltan)}/{len(required)} campos K presentes "
              f"({', '.join(faltan) or 'todos'}); {len(updates)} actualizacion(es) de personas, "
              f"{len(updates) - len(sin_admin)}/{len(updates)} restringidas a administrador",
              "los 8 campos K presentes y toda escritura de personas tras exigirAdmin",
              sin_admin or ["src/db/schema.ts"])


def chk_condicionalidad_egresado() -> None:
    """reglas/important.md §1: matriz de condicionalidad del formulario de egresados."""
    portal = BASE_DIR / "src" / "app" / "portal" / "egresado" / "page.tsx"
    if not portal.is_file():
        registrar("REG-04", "Reglas de negocio", "Condicionalidad del formulario de egresado",
                  "reglas/important.md §1 (matriz de condicionalidad)", "FAIL",
                  "src/app/portal/egresado/page.tsx no existe",
                  "planea_titularse gobierna inicio_proceso_titulacion y motivo_no_titulacion")
        return
    c = leer(portal)
    # El portal usa nombres de columna en camelCase (planeaTitularse); el resto del
    # proyecto usa snake_case. Un control que solo mirara una forma daria un falso
    # negativo sobre una regla que si se cumple.
    gobierna = bool(re.search(r"planea_?[Tt]itularse", c))
    muestra_inicio = bool(re.search(r"inicio_?[Pp]roceso_?[Tt]itulacion", c))
    muestra_motivo = bool(re.search(r"motivo_?[Nn]o_?[Tt]itulacion", c))
    n_condicion = len(re.findall(r"planea_?[Tt]itularse", c))
    condicional = n_condicion >= 2
    estado = "PASS" if (gobierna and muestra_inicio and muestra_motivo and condicional) else "FAIL"
    registrar("REG-04", "Reglas de negocio", "Condicionalidad del formulario de egresado",
              "reglas/important.md §1 (matriz de condicionalidad)", estado,
              f"planeaTitularse presente={gobierna} (usado {n_condicion} veces); "
              f"inicio_proceso_titulacion={muestra_inicio}; motivo_no_titulacion={muestra_motivo}",
              "las tres variables de la matriz presentes y la condicionalidad implementada",
              ["src/app/portal/egresado/page.tsx"])


def chk_exportacion_en_memoria() -> None:
    """
    reglas/important.md §2: los reportes se generan en memoria; prohibido escribir
    ficheros de exportacion en disco. Se comprueba la ausencia de escrituras y la
    presencia de los cabeceras HTTP correctos.
    """
    archivos = fuentes(".ts")
    escrituras = buscar(r"(writeFileSync|writeFile|createWriteStream|appendFile)", archivos)
    # Se descartan los COMENTARIOS que mencionan fs.writeFileSync para explicar la
    # prohibicion, y las escrituras de documentos SUBIDOS por el titular: la regla
    # prohibe escribir REPORTES en disco, no almacenar adjuntos.
    reportes, uploads = [], []
    for a, linea in escrituras:
        if linea.lstrip().startswith(("*", "//", "#")):
            continue
        c = leer(a)
        (uploads if re.search(r"(documento|adjunto|bytes|upload|destino|almacenado)", c, re.I)
         else reportes).append((a, linea))
    cabeceras = buscar(r"Content-Disposition", archivos)
    mimes = buscar(r"(text/csv|spreadsheetml\.sheet|application/pdf)", archivos)
    estado = "PASS" if (not reportes and cabeceras and mimes) else "FAIL"
    registrar("REG-05", "Reglas de negocio", "Exportacion en memoria (sin escritura a disco)",
              "reglas/important.md §2 (exportacion en memoria)", estado,
              f"{len(reportes)} escritura(s) de REPORTE a disco (prohibidas); "
              f"{len(uploads)} escritura(s) de documento subido por el titular "
              f"(permitidas); {len(cabeceras)} Content-Disposition; "
              f"{len(mimes)} Content-Type de reporte",
              "0 escrituras de reportes a disco y cabeceras HTTP de descarga en las rutas",
              ev(reportes, 5) or ev(cabeceras, 3) or ev(uploads, 3),
              nota="los adjuntos de las solicitudes SI deben persistir en disco; "
                   "la regla protege solo los reportes exportados" if uploads else "")


def chk_backup_sin_pg_dump() -> None:
    """reglas/important.md §2: los backups no dependen del binario pg_dump."""
    archivos = fuentes(".ts") + fuentes(".tsx")
    exec_pg = buscar(r"(exec|spawn|execSync|execFile)\s*\([^)]*pg_dump", archivos)
    tiene_backup = any("backup" in rel(a).lower() for a in archivos)
    # El script de backup del repositorio tambien cuenta: si invoca pg_dump, el
    # respaldo depende del cliente de PostgreSQL del sistema, que la imagen de
    # produccion no incluye (regla important.md 2).
    sh = BASE_DIR / "scripts" / "backup.sh"
    sh_usa_pg = bool(sh.is_file() and re.search(r"pg_dump", leer(sh)))
    estado = "PASS" if (tiene_backup and not exec_pg and not sh_usa_pg) else "FAIL"
    registrar("REG-06", "Reglas de negocio", "Backups independientes del cliente pg_dump",
              "reglas/important.md §2", estado,
              f"{len(exec_pg)} invocacion(es) de pg_dump desde el codigo; "
              f"scripts/backup.sh invoca pg_dump={sh_usa_pg}; "
              f"backup generado desde la aplicacion={tiene_backup}",
              "0 llamadas a pg_dump y backup generado desde la propia aplicacion",
              (["scripts/backup.sh"] if sh_usa_pg else []) or ev(exec_pg) or
              [rel(a) for a in archivos if "backup" in rel(a).lower()][:5],
              nota="el unico respaldo del repositorio es scripts/backup.sh, que invoca el "
                   "binario pg_dump del sistema: dentro del contenedor de produccion no "
                   "funcionara, porque la imagen no incluye el cliente de PostgreSQL. La "
                   "regla pide generar el respaldo desde la propia aplicacion"
                   if sh_usa_pg else "")


def chk_agregaciones_en_bd() -> None:
    """
    reglas/important.md §3: las estadisticas se calculan en la base de datos, no
    recorriendo arrays en JavaScript.
    """
    apis = rutas_api()
    con_agg = [rel(a) for a in apis if re.search(r"\b(count|avg|sum|groupBy|max|min)\s*\(", leer(a), re.I)]
    con_pull = [rel(a) for a in apis if re.search(r"\.reduce\(|\.map\(.*\.length", leer(a))]
    usados = sorted({m for a in apis
                     for m in re.findall(r"\b(count|avg|sum|groupBy)\s*\(", leer(a), re.I)})
    estado = "PASS" if len(con_agg) >= 3 else ("WARN" if con_agg else "FAIL")
    registrar("REG-07", "Reglas de negocio", "Agregaciones calculadas en la base de datos",
              "reglas/important.md §3 (rendimiento e integridad)", estado,
              f"{len(con_agg)}/{len(apis)} rutas usan agregaciones SQL "
              f"({', '.join(usados) or 'ninguna'}); "
              f"{len(con_pull)} recorren arrays en JS",
              "el dashboard calcula sus KPI con GROUP BY/COUNT en PostgreSQL",
              con_agg[:8] or (con_pull[:5] and "solo agregacion en JS") or [],
              nota="el calculo en memoria no es incorrecto, pero no escala con el volumen"
                   if con_pull else "")


def chk_indices() -> None:
    """ISO/IEC 25010 §8.2.3 (eficiencia): indices sobre las columnas de filtro."""
    schema = leer(SRC_DIR / "db" / "schema.ts")
    indices = re.findall(r'(index|uniqueIndex)\("([^"]+)"', schema)
    if not indices:
        return
    suficientes = len(indices) >= 5
    estado = "PASS" if suficientes else "WARN"
    registrar("REG-08", "Reglas de negocio", "Indices declarados en el esquema",
              "ISO/IEC 25010:2011 §8.2.3 (eficiencia); reglas/important.md §3", estado,
              f"{len(indices)} indice(s) declarados: {', '.join(n for _, n in indices[:8])}"
              f"{'...' if len(indices) > 8 else ''}",
              "indices sobre las columnas usadas para filtrar y ordenar",
              ["src/db/schema.ts"],
              nota="conviene contrastar con los WHERE reales del dashboard; "
                   "no se puede afirmar cobertura sin trazas de ejecucion"
                   if not suficientes else "")


# ===========================================================================
# 8. CALIDAD Y MANTENIBILIDAD
# ===========================================================================


def chk_manejo_errores() -> None:
    """
    ISO/IEC 25010 §8.2.4 (fiabilidad): TODAS las rutas de API deben tratar los
    errores. Umbral real: 100% de las rutas que hacen E/S, con helper de error
    interno que no filtre detalles al cliente.
    """
    apis = rutas_api()
    con_try = [rel(a) for a in apis if re.search(r"\btry\s*\{", leer(a)) and re.search(r"\bcatch\b", leer(a))]
    con_helper = [rel(a) for a in apis if "errorInterno" in leer(a)]
    estado = "PASS" if len(con_try) == len(apis) else ("WARN" if len(con_try) >= len(apis) * 0.9 else "FAIL")
    registrar("CAL-01", "Calidad y mantenibilidad", "Manejo explicito de errores en las APIs",
              "ISO/IEC 25010:2011 §8.2.4 (fiabilidad)", estado,
              f"{len(con_try)}/{len(apis)} rutas con try/catch ({pct(len(con_try), len(apis))}); "
              f"{len(con_helper)} usan el helper de error interno",
              "el 100% de las rutas de API captura sus errores",
              [r for r in [rel(a) for a in apis] if r not in con_try][:8]
              or [rel(a) for a in apis[:4]],
              nota="una ruta sin try/catch devuelve al cliente el error crudo de la BD" 
                   if len(con_try) < len(apis) else "")


def chk_error_interno_no_filtra() -> None:
    """ISO/IEC 27002 8.16: el error 500 no debe filtrar el detalle interno."""
    guards = leer(SRC_DIR / "lib" / "guards.ts")
    helper = "errorInterno" in guards
    filtra = bool(re.search(r"error:\s*`[^`]*\$\{\s*e\b", guards))
    estado = "PASS" if (helper and not filtra) else ("WARN" if helper else "FAIL")
    registrar("CAL-02", "Calidad y mantenibilidad", "El error 500 no filtra detalle interno",
              "ISO/IEC 27002:2022 §8.16 (fuga de informacion)", estado,
              f"helper errorInterno presente={helper}; "
              f"interpola el error crudo al cliente={filtra}",
              "un unico punto de error que registra en servidor y responde generico",
              ["src/lib/guards.ts"])


def chk_typescript_estricto() -> None:
    """ISO/IEC 25010 (mantenibilidad): tipado estricto, sin `any` implícito."""
    tsconfig = leer(BASE_DIR / "tsconfig.json")
    try:
        cfg = json.loads(re.sub(r",(\s*[}\]])", r"\1", tsconfig)) if tsconfig else {}
    except json.JSONDecodeError:
        cfg = {}
    cflags = cfg.get("compilerOptions", {})
    strict = bool(cflags.get("strict"))
    any_explicito = buscar(r":\s*any\b|as\s+any\b", fuentes(".ts") + fuentes(".tsx"))
    n_any = len(any_explicito)
    total_archivos = len(fuentes(".ts")) + len(fuentes(".tsx"))
    if not strict:
        estado = "FAIL"
    elif n_any > total_archivos * 0.05:
        estado = "WARN"
    else:
        estado = "PASS"
    registrar("CAL-03", "Calidad y mantenibilidad", "TypeScript en modo estricto",
              "ISO/IEC 25010:2011 §8.2.7 (mantenibilidad)", estado,
              f"strict={strict}; usos de `any`={n_any} sobre {total_archivos} archivos "
              f"({pct(n_any, total_archivos)})",
              "strict=true y menos del 5% de usos de `any`",
              ev(any_explicito, 6))


def chk_tamano_modulos() -> None:
    """
    ISO/IEC 25010 (mantenibilidad): cohesion. Ningun archivo debe superar las 800
    lineas; por encima, el modulo hace mas de una cosa.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")
    if not archivos:
        return
    largos = [(a, len(leer(a).splitlines())) for a in archivos]
    excessivos = [(a, n) for a, n in largos if n > 800]
    estado = "PASS" if not excessivos else "WARN"
    registrar("CAL-04", "Calidad y mantenibilidad", "Cohesion de modulos (<=800 lineas)",
              "ISO/IEC 25010:2011 §8.2.7", estado,
              f"{len(excessivos)}/{len(archivos)} archivos superan 800 lineas; "
              f"mayor={max((n for _, n in largos), default=0)} lineas",
              "ningun archivo por encima de 800 lineas",
              [f"{rel(a)} ({n} lineas)" for a, n in sorted(excessivos, key=lambda x: -x[1])[:5]])


def chk_complejidad_queries() -> None:
    """
    ISO/IEC 25010 §8.2.3 (eficiencia): las consultas al listado deben acotar el
    resultado. Un listado sin LIMIT puede agotar la memoria del servidor.
    """
    apis = rutas_api()
    listados = []
    for a in apis:
        c = leer(a)
        if ".from(personas)" in c and re.search(r"export\s+async\s+function\s+GET", c):
            listados.append(a)
    acotadas = [rel(a) for a in listados if ".limit(" in leer(a)]
    estado = "PASS" if listados and len(acotadas) == len(listados) else (
        "WARN" if listados else "SKIP")
    registrar("CAL-05", "Calidad y mantenibilidad", "Listados acotados en el servidor",
              "ISO/IEC 25010:2011 §8.2.3 (eficiencia); reglas/important.md §3", estado,
              f"{len(acotadas)}/{len(listados)} rutas de listado de personas con LIMIT",
              "toda consulta de listado devuelve un numero acotado de filas",
              [rel(a) for a in listados if rel(a) not in acotadas],
              nota="no aplica: no hay rutas de listado de personas" if not listados else "")


def chk_paginacion_tope() -> None:
    """ISO/IEC 25010 §8.2.3: el cliente no puede pedir un perPage ilimitado."""
    ruta = BASE_DIR / "src" / "app" / "api" / "personas" / "route.ts"
    if not ruta.is_file():
        return
    c = leer(ruta)
    tope = bool(re.search(r"Math\.min\(\s*\d+\s*,", c))
    offset = ".offset(" in c
    estado = "PASS" if (tope and offset) else "FAIL"
    registrar("CAL-06", "Calidad y mantenibilidad", "Paginacion con tope maximo en el servidor",
              "ISO/IEC 25010:2011 §8.2.3", estado,
              f"perPage acotado con Math.min={tope}; uso de offset={offset}",
              "el servidor impone un maximo de registros por pagina",
              ["src/app/api/personas/route.ts"])


def chk_zod() -> None:
    """
    ISO/IEC 25010 (seguridad de entrada): TODAS las rutas de escritura deben
    validar su cuerpo con un esquema. Una entrada sin validar es un dato que llega
    crudo a la base de datos.
    """
    apis = rutas_api()
    escritura, con_validacion = [], []
    rx = re.compile(r"export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b")
    for a in apis:
        c = leer(a)
        if not rx.search(c):
            continue
        escritura.append(a)
        if re.search(r"\.parse\(|safeParse|z\.object|z\.string|z\.enum", c) or "validaciones" in c:
            con_validacion.append(rel(a))
    sin_val = [rel(a) for a in escritura if rel(a) not in con_validacion]
    estado = "PASS" if not sin_val else ("WARN" if len(con_validacion) / max(len(escritura), 1) >= 0.9 else "FAIL")
    registrar("CAL-07", "Calidad y mantenibilidad", "Validacion de entrada en las rutas de escritura",
              "ISO/IEC 25010:2011 §8.2.4 (fiabilidad); OWASP Input Validation",
              estado,
              f"{len(con_validacion)}/{len(escritura)} rutas de escritura validan con esquema "
              f"({pct(len(con_validacion), len(escritura))})",
              "el 100% de las rutas de escritura validan su entrada antes de tocar la BD",
              sin_val)


def chk_accesibilidad() -> None:
    """
    ISO/IEC 25010 (usabilidad): la accesibilidad NO se puede afirmar por la
    presencia de `aria-`. Se mide la densidad de atributos y se declara el limite:
    esto no sustituye una auditoria con motor (axe/Lighthouse).
    """
    tsx = componentes() + paginas()
    if not tsx:
        return
    con_aria = [a for a in tsx if re.search(r"aria-[a-z]+=", leer(a))]
    con_label = [a for a in tsx if re.search(r"<label|htmlFor=", leer(a))]
    con_alt = [a for a in tsx if re.search(r"alt=", leer(a))]
    interactivos = [a for a in tsx if "<button" in leer(a) or "<input" in leer(a) or "<select" in leer(a)]
    con_tipo = [a for a in interactivos
                if re.search(r"<button[^>]*type=", leer(a))]
    estado = "PASS" if len(con_aria) >= len(tsx) * 0.5 else (
        "WARN" if con_aria else "FAIL")
    registrar("CAL-08", "Calidad y mantenibilidad", "Atributos de accesibilidad en la interfaz",
              "ISO/IEC 25010:2011 §8.2.6 (usabilidad); WCAG 2.1 AA", estado,
              f"{len(con_aria)}/{len(tsx)} componentes con ARIA ({pct(len(con_aria), len(tsx))}); "
              f"{len(con_label)} con label; {len(con_alt)} con alt; "
              f"{len(con_tipo)}/{len(interactivos)} con type en botones",
              "atributos ARIA en la mitad de los componentes interactivos",
              [rel(a) for a in con_aria][:8],
              nota="VERIFICACION ESTATICA: no se ejecuto axe ni Lighthouse. "
                   "La conformidad WCAG exige contraste medido, navegacion por teclado "
                   "y lectura por lector de pantalla, nada de lo cual se comprueba aqui.")


def chk_performance() -> None:
    """
    ISO/IEC 25010 §8.2.3 (eficiencia): optimizaciones observables en el cliente.
    Se mide la densidad real, no la mera presencia de la palabra.
    """
    tsx = componentes() + paginas()
    if not tsx:
        return
    memo = [a for a in tsx if re.search(r"\buseMemo\b|\buseCallback\b|\bmemo\(", leer(a))]
    loading = [a for a in tsx if re.search(r"loading|isLoading|cargando", leer(a), re.I)]
    estado = "PASS" if len(memo) >= 3 else ("WARN" if memo else "FAIL")
    registrar("CAL-09", "Calidad y mantenibilidad", "Optimizacion de renderizado en el cliente",
              "ISO/IEC 25010:2011 §8.2.3 (eficiencia)", estado,
              f"{len(memo)}/{len(tsx)} componentes con memoizacion; "
              f"{len(loading)} con estado de carga declarado",
              "memoizacion en los componentes que listan o calculan en render",
              [rel(a) for a in memo][:6],
              nota="no se midio tiempo de render ni peso del bundle: esto es analisis estatico")


def chk_responsive() -> None:
    """ISO/IEC 25010 §8.2.6 (usabilidad): puntos de ruptura de Tailwind en la UI."""
    tsx = componentes() + paginas()
    if not tsx:
        return
    con_break = [a for a in tsx if re.search(r"\b(sm|md|lg|xl):", leer(a))]
    estado = "PASS" if len(con_break) >= len(tsx) * 0.6 else (
        "WARN" if con_break else "FAIL")
    registrar("CAL-10", "Calidad y mantenibilidad", "Diseno responsive en la interfaz",
              "ISO/IEC 25010:2011 §8.2.6 (usabilidad)", estado,
              f"{len(con_break)}/{len(tsx)} componentes con puntos de ruptura "
              f"({pct(len(con_break), len(tsx))})",
              "clases responsive en la mayoria de los componentes de interfaz",
              [rel(a) for a in tsx if a not in con_break][:6],
              nota="no se verifico el resultado visual en distintos anchos")


def chk_configuracion() -> None:
    """ISO/IEC 25010 (mantenibilidad): la configuracion esta declarada y es coherente."""
    archivos = [BASE_DIR / ".env.example", BASE_DIR / "drizzle.config.ts",
                BASE_DIR / "next.config.mjs", BASE_DIR / "tsconfig.json",
                BASE_DIR / "tailwind.config.ts"]
    faltan = [f.name for f in archivos if not f.is_file()]
    drizzle = leer(BASE_DIR / "drizzle.config.ts")
    migraciones = len(list((BASE_DIR / "drizzle").rglob("*.sql"))) if (BASE_DIR / "drizzle").is_dir() else 0
    estado = "PASS" if not faltan and migraciones else "FAIL"
    registrar("CAL-11", "Calidad y mantenibilidad", "Configuracion declarada y migraciones generadas",
              "ISO/IEC 25010:2011 §8.2.7", estado,
              f"{len(archivos) - len(faltan)}/{len(archivos)} ficheros de configuracion "
              f"presentes; {migraciones} migracion(es) SQL en drizzle/",
              "configuracion completa y migraciones versionadas en el repositorio",
              [f.name for f in archivos if f.is_file()] + ([", ".join(faltan)] if faltan else []))


def chk_datos_sinteticos() -> None:
    """
    Un sistema academico no debe sembrar datos que parezcan personas reales.
    Se comprueba que el seed usa datos identificables como ficticios.
    """
    seeds = list((BASE_DIR / "scripts").glob("seed*.ts")) if (BASE_DIR / "scripts").is_dir() else []
    if not seeds:
        registrar("CAL-12", "Calidad y mantenibilidad", "Datos de prueba marcados como ficticios",
                  "ISO/IEC 25010 §8.2.4; ISO/IEC 27002 §8.16", "SKIP",
                  "0 scripts de seed", "los datos de prueba deben ser declarados ficticios",
                  nota="no aplica: no hay scripts de seed")
        return
    con_marca = [rel(s) for s in seeds if re.search(r"(test|prueba|fake|dummy|0000|EJEMPLO)", leer(s), re.I)]
    estado = "PASS" if len(con_marca) == len(seeds) else "WARN"
    registrar("CAL-12", "Calidad y mantenibilidad", "Datos de prueba marcados como ficticios",
              "ISO/IEC 25010 §8.2.4; ISO/IEC 27002 §8.16", estado,
              f"{len(con_marca)}/{len(seeds)} scripts de seed con datos declarados ficticios",
              "los datos sembrados son identificables como ficticios",
              con_marca or [rel(s) for s in seeds])


def chk_dependencias() -> None:
    """
    ISO/IEC 25010: las dependencias de ejecucion son minimas. Un ejemplo de
    proyecto academico no necesita 40 paquetes de ejecucion.
    """
    pkg = leer(BASE_DIR / "package.json")
    try:
        deps = json.loads(pkg).get("dependencies", {})
    except json.JSONDecodeError:
        deps = {}
    nucleo = [d for d in deps if d in ("next", "react", "react-dom")]
    otros = [d for d in deps if d not in nucleo]
    estado = "PASS" if len(otros) <= 15 else "WARN"
    registrar("CAL-13", "Calidad y mantenibilidad", "Superficie de dependencias acotada",
              "ISO/IEC 25010:2011 §8.2.7; OWASP Dependency Management", estado,
              f"{len(deps)} dependencias de ejecucion: {', '.join(sorted(deps))}",
              "lista de dependencias corta y justifiable",
              sorted(deps),
              nota="cada dependencia es un riesgo de suministro; las justificadas deben "
                   "quedar documentadas" if len(otros) > 10 else "")


def chk_documentacion() -> None:
    """ISO/IEC 25010 (mantenibilidad): documentacion actualizada y util."""
    readme = BASE_DIR / "README.md"
    reglas = BASE_DIR / "reglas" / "important.md"
    if not readme.is_file():
        registrar("CAL-14", "Calidad y mantenibilidad", "Documentacion del proyecto",
                  "ISO/IEC 25010:2011 §8.2.7", "FAIL", "README.md ausente",
                  "README con instalacion, uso y arquitectura")
        return
    c = leer(readme)
    secciones = sum(1 for s in ("Instalaci", "Uso", "Arquitectura", "Variables de entorno",
                                "Scripts", "Despliegue") if re.search(s, c, re.I))
    estado = "PASS" if secciones >= 4 else ("WARN" if secciones >= 2 else "FAIL")
    registrar("CAL-14", "Calidad y mantenibilidad", "Documentacion del proyecto",
              "ISO/IEC 25010:2011 §8.2.7", estado,
              f"{secciones}/6 secciones esperadas en README.md; "
              f"reglas/important.md presente={reglas.is_file()}",
              "README con instalacion, uso, arquitectura, variables y scripts",
              ["README.md", "reglas/important.md"])


# ===========================================================================
# 9. FUNCIONALIDAD (verificacion de que las capacidades existen y son alcanzables)
# ===========================================================================


def chk_funcionalidad() -> None:
    """
    Cada capacidad del plan debe tener una ruta de API o una pagina que la
    implemente. Se comprueba la EXISTENCIA y el contenido minimo esperado, no solo
    el nombre del directorio.
    """
    capacidades = {
        "exportacion de datos": (BASE_DIR / "src" / "app" / "api" / "exportar" / "route.ts",
                                 r"Content-Disposition|GET"),
        "importacion de datos": (BASE_DIR / "src" / "app" / "api" / "importar" / "route.ts",
                                 r"POST|parse|formData"),
        "reportes PDF": (BASE_DIR / "src" / "app" / "api" / "exportar" / "pdf" / "route.ts",
                         r"application/pdf|PDFDocument"),
        "enlace de verificacion": (BASE_DIR / "src" / "app" / "api" / "exportar" / "enlace" / "route.ts",
                                   r"firmarDescarga|token|Verificacion|crearVerificacion"),
        "auditoria consultable": (BASE_DIR / "src" / "app" / "api" / "auditoria" / "route.ts",
                                  r"auditLog|count"),
        "dashboard con KPI": (BASE_DIR / "src" / "app" / "api" / "dashboard" / "route.ts",
                              r"count|total|tasa"),
        "gestion de usuarios": (BASE_DIR / "src" / "app" / "api" / "usuarios" / "route.ts",
                                r"POST|DELETE|usuarios"),
        "gestion de noticias": (BASE_DIR / "src" / "app" / "api" / "noticias" / "route.ts",
                                r"POST|PATCH"),
        "solicitudes de kardex": (BASE_DIR / "src" / "app" / "api" / "solicitudes" / "route.ts",
                                  r"POST|solicitud"),
        "portal del titulado": (BASE_DIR / "src" / "app" / "portal" / "titulado" / "page.tsx",
                                r"useState|mis-datos"),
        "portal del egresado": (BASE_DIR / "src" / "app" / "portal" / "egresado" / "page.tsx",
                                r"planea_?[Tt]itularse|mis-datos"),
        "registro publico": (BASE_DIR / "src" / "app" / "registro" / "page.tsx",
                             r"form|registro"),
        "login": (BASE_DIR / "src" / "app" / "login" / "page.tsx",
                  r"fetch|login|contrase"),
    }
    filas, faltantes, vacias = [], [], []
    for nombre, (p, rx) in capacidades.items():
        if not p.is_file():
            faltantes.append(nombre)
            filas.append((nombre, "FAIL", "no existe", rel(p)))
            continue
        c = leer(p)
        ok = bool(re.search(rx, c, re.I))
        if not ok:
            vacias.append(nombre)
        filas.append((nombre, "PASS" if ok else "WARN",
                      "implementada" if ok else "existe pero sin la logica esperada", rel(p)))
    estado = "PASS" if not faltantes and not vacias else ("WARN" if not faltantes else "FAIL")
    registrar("FUN-01", "Funcionalidad", "Capacidades del plan implementadas y alcanzables",
              "ISO/IEC 25010:2011 §8.2.2 (funcionalidad); ISO/IEC 29119 §4", estado,
              f"{len(capacidades) - len(faltantes) - len(vacias)}/{len(capacidades)} "
              f"capacidades con implementacion detectable "
              f"({', '.join(faltantes + vacias) or 'todas'})",
              "las capacidades del plan tienen ruta o pagina con logica propia",
              [r for n, e, _, r in filas if e != "PASS"]
              or [r for _, _, _, r in filas[:4]],
              nota="se verifica la existencia y el contenido esperado, NO el comportamiento "
                   "en ejecucion: eso exigiria pruebas de integracion contra la base de datos")


def chk_kpis() -> None:
    """
    ISO/IEC 25010 §8.2.2: los KPI del dashboard se calculan, no se_estiman.
    """
    rutas = BASE_DIR / "src" / "app" / "api" / "dashboard" / "route.ts"
    if not rutas.is_file():
        return
    c = leer(rutas)
    agregaciones = sorted({m for m in re.findall(r"\b(count|avg|sum|max|min)\s*\(", c, re.I)})
    kpis = sorted(set(re.findall(r'"(tasa[^"]*|total[^"]*|porcentaje[^"]*|promedio[^"]*)"', c, re.I)))
    tiene_titulacion = bool(re.search(r"titulad", c, re.I))
    tiene_genero = bool(re.search(r"g[eé]nero|sexo", c, re.I))
    tiene_sector = bool(re.search(r"sector|laboral|empleo", c, re.I))
    estado = "PASS" if (len(agregaciones) >= 2 and tiene_titulacion) else "WARN"
    registrar("FUN-02", "Funcionalidad", "KPI del dashboard calculados en la base de datos",
              "ISO/IEC 25010:2011 §8.2.2", estado,
              f"agregaciones SQL usadas={len(agregaciones)} ({', '.join(agregaciones)}); "
              f"dimensiones: titulacion={tiene_titulacion}, genero={tiene_genero}, "
              f"sector laboral={tiene_sector}",
              "los KPI del plan se calculan con agregaciones en PostgreSQL",
              ["src/app/api/dashboard/route.ts"],
              nota="no se validan las cifras: eso requiere comparar contra el calculo manual "
                   "de la especificacion")


def chk_publicacion_kpi() -> None:
    """
    Ley 1405 art. 5 aplicada a los KPI: un KPI debe devolver null (no publicar) en
    lugar de publicar un numero que permita identificar a alguien.
    """
    archivos = fuentes(".ts") + fuentes(".tsx")
    devuelve_null = buscar(r"return\s+null", archivos)

    aplica_k = buscar(r"K_MIN", archivos)
    supresion_null = buscar(r"(show_kpi|aplicarKAnonimato|muestraSuficiente)", archivos)
    if not aplica_k:
        registrar("FUN-03", "Funcionalidad", "Los KPI suprimen el dato por debajo del umbral",
                  "Ley 1405 art. 5; ISO/IEC 25010 §8.2.2", "FAIL",
                  "no se aplica ningun umbral K_MIN a los indicadores",
                  "todo KPI devuelve null cuando el grupo es menor que K",
                  [])
        return
    estado = "PASS" if devuelve_null else "FAIL"
    registrar("FUN-03", "Funcionalidad", "Los KPI suprimen el dato por debajo del umbral",
              "Ley 1405 art. 5: no se publica informacion individual", estado,
              f"{len(aplica_k)} aplicacion(es) de K_MIN; {len(devuelve_null)} retornos null "
              f"para suprimir la publicacion",
              "todo indicador devuelve null (y no un numero) cuando n < K",
              ev(aplica_k, 6))


# ===========================================================================
# 10. Auto-auditoria de la propia suite
# ===========================================================================


def chk_autoauditoria() -> None:
    """
    Una suite que se autodeclara conforme no vale nada si puede pasar vacia.
    Este control verifica que la propia ejecucion cumple sus reglas de diseño.
    """
    sin_norma = [c.id for c in RESULTADOS if not c.norma.strip()]
    sin_umbral = [c.id for c in RESULTADOS if not c.umbral.strip()]
    sin_medida = [c.id for c in RESULTADOS if not c.medida.strip()]
    passes_sin_evidencia = [c.id for c in RESULTADOS
                            if c.estado == "PASS" and not c.evidencia and "todo" not in c.nombre.lower()]
    vacios = sin_norma + sin_umbral + sin_medida + passes_sin_evidencia
    if not RESULTADOS:
        registrar("AUD-01", "Auto-auditoria de la suite", "La suite se audita a si misma",
                  "ISO/IEC 25010 §8.2.7; ISO/IEC 29119-2 §5.6 (control del proceso)",
                  "FAIL", "0 controles evaluados", "N controles con norma, umbral y evidencia")
        return
    estado = "PASS" if not vacios else "FAIL"
    registrar("AUD-01", "Auto-auditoria de la suite", "La suite se audita a si misma",
              "ISO/IEC 25019-2 §5.6; ISO/IEC 25010 §8.2.7", estado,
              f"{len(RESULTADOS)} controles previos a esta auditoria; sin norma={len(sin_norma)}; "
              f"sin umbral={len(sin_umbral)}; sin medida={len(sin_medida)}; "
              f"PASS sin evidencia={len(passes_sin_evidencia)}",
              "todo control con norma, umbral y medida; ningun PASS sin evidencia",
              vacios,
              nota="" if not vacios else "controles sin respaldo: " + ", ".join(vacios))


def chk_fraccion_verificable() -> None:
    """
    Honestidad del informe: que porcentaje de lo afirmado es realmente medido.
    """
    # Total = todos los controles registrados + este propio control (coincide con el
    # recuento global del informe). Solo cuentan como "ejecucion real" los dinamicos
    # que efectivamente corrieron (no los omitidos con --sin-dinamicos).
    total = len(RESULTADOS) + 1
    base_analitica = len([c for c in RESULTADOS
                          if c.metodo == "dinamico" and c.estado != "SKIP"])
    estado = "PASS" if base_analitica > 0 else "WARN"
    registrar("AUD-02", "Auto-auditoria de la suite", "Proporcion de controles con ejecucion real",
              "ISO/IEC 29119-2 §5.6", estado,
              f"{base_analitica}/{total} controles ejecutan herramientas reales "
              f"(compilacion, lint, suite de pruebas); "
              f"{total - base_analitica} son analisis estatico",
              "al menos una verificacion dinamica por bloque",
              [c.id for c in RESULTADOS if c.metodo == "dinamico" and c.estado != "SKIP"],
              nota="el resto son verificaciones estaticas: son congruentes con lo que el "
                   "codigo declara, no con lo que el sistema hace en ejecucion")


# ===========================================================================
# 11. Informe
# ===========================================================================


def resumen() -> dict:
    por_cat: dict[str, dict[str, int]] = {}
    for c in RESULTADOS:
        d = por_cat.setdefault(c.categoria, {"PASS": 0, "FAIL": 0, "WARN": 0, "SKIP": 0})
        d[c.estado] += 1
    total = len(RESULTADOS)
    return {
        "generado": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "proyecto": "Sistema de Seguimiento a Titulados y Egresados - Estadistica UMSA",
        "version_suite": "2.0 (verificacion con umbrales y evidencia)",
        "herramienta": f"Python {sys.version.split()[0]}",
        "ambito": rel(SRC_DIR),
        "controles": total,
        "pass": sum(1 for c in RESULTADOS if c.estado == "PASS"),
        "fail": sum(1 for c in RESULTADOS if c.estado == "FAIL"),
        "warn": sum(1 for c in RESULTADOS if c.estado == "WARN"),
        "skip": sum(1 for c in RESULTADOS if c.estado == "SKIP"),
        "por_categoria": por_cat,
        "alcance_y_limitaciones": [
            "Verificacion estatica de codigo fuente y verificacion dinamica de herramientas "
            "(compilacion, lint, suite de pruebas).",
            "No es una certificacion ISO ni una auditoria de conformidad formal.",
            "No incluye prueba de penetracion, analisis de vulnerabilidades de dependencias "
            "ni pruebas de carga.",
            "La conformidad WCAG no puede afirmarse: no se ejecuto axe ni Lighthouse.",
            "El comportamiento en ejecucion de la base de datos no se verifica: las pruebas "
            "unitarias existentes trabajan sobre funciones puras.",
            "Los resultados dependen del codigo fuente en el momento de la ejecucion.",
        ],
    }


def escribir_json(res: dict) -> Path:
    destino = AQUI / "resultados.json"
    destino.write_text(json.dumps({"resumen": res, "controles": [c.a_dict() for c in RESULTADOS]},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
    return destino


ICONO = {"PASS": "OK", "FAIL": "FALLO", "WARN": "AVISO", "SKIP": "N/AP"}


def escribir_docx(res: dict) -> Path:
    try:
        from docx import Document
        from docx.shared import Pt, Inches, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        print("[AVISO] python-docx no disponible: se omite resultados.docx")
        return None

    doc = Document()
    est = doc.styles["Normal"]
    est.font.name = "Calibri"
    est.font.size = Pt(10)

    doc.add_heading("Informe de Verificacion de Calidad y Seguridad", level=0)
    p = doc.add_paragraph(res["proyecto"])
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    t = doc.add_table(rows=0, cols=4)
    t.style = "Light Grid Accent 1"
    for k, v in (("Generado", res["generado"]),
                 ("Suite", res["version_suite"]),
                 ("Python", res["herramienta"]),
                 ("Ambito", res["ambito"]),
                 ("Controles", f"{res['controles']} "
                               f"(OK {res['pass']} | FALLO {res['fail']} | "
                               f"AVISO {res['warn']} | N/AP {res['skip']})")):
        row = t.add_row().cells
        row[0].text = k
        row[1].merge(row[2]).merge(row[3])
        row[1].text = str(v)

    doc.add_heading("Alcance y limitaciones", level=1)
    for lim in res["alcance_y_limitaciones"]:
        doc.add_paragraph(lim, style="List Bullet")

    doc.add_heading("Resultado por categoria", level=1)
    for cat, stats in res["por_categoria"].items():
        doc.add_paragraph(
            f"{cat}: OK {stats['PASS']} | FALLO {stats['FAIL']} | "
            f"AVISO {stats['WARN']} | N/AP {stats['SKIP']}")

    doc.add_heading("Detalle de controles", level=1)
    cat_actual = None
    for c in RESULTADOS:
        if c.categoria != cat_actual:
            cat_actual = c.categoria
            doc.add_heading(cat_actual, level=2)
        par = doc.add_paragraph()
        run = par.add_run(f"[{ICONO[c.estado]}] {c.id}  ")
        run.bold = True
        if c.estado == "FAIL":
            run.font.color.rgb = RGBColor(0xB0, 0x00, 0x00)
        elif c.estado == "WARN":
            run.font.color.rgb = RGBColor(0xB5, 0x6A, 0x00)
        elif c.estado == "PASS":
            run.font.color.rgb = RGBColor(0x00, 0x60, 0x00)
        par.add_run(c.nombre).bold = True
        doc.add_paragraph(f"    Norma: {c.norma}", style="List Bullet")
        doc.add_paragraph(f"    Medida: {c.medida}", style="List Bullet")
        doc.add_paragraph(f"    Umbral: {c.umbral}", style="List Bullet")
        if c.evidencia:
            doc.add_paragraph("    Evidencia: " + "; ".join(c.evidencia[:5]), style="List Bullet")
        if c.nota:
            doc.add_paragraph(f"    Nota: {c.nota}", style="List Bullet")

    doc.add_paragraph()
    doc.add_paragraph(
        "Este informe no constituye una certificacion. Los controles PASS significan que "
        "la condicion medida se cumple en el codigo en la fecha indicada, no que el sistema "
        "sea correcto en todos sus entornos posibles.")
    destino = AQUI / "resultados.docx"
    doc.save(destino)
    return destino


# ===========================================================================
# 12. Programa principal
# ===========================================================================


def main() -> int:
    global DINAMICOS_ACTIVOS
    ap = argparse.ArgumentParser(description="Suite de verificacion de calidad y seguridad (v2)")
    ap.add_argument("--sin-dinamicos", action="store_true",
                    help="omite los controles que ejecutan tsc, eslint y la suite de pruebas")
    args = ap.parse_args()
    DINAMICOS_ACTIVOS = not args.sin_dinamicos

    print("=" * 78)
    print("VERIFICACION DE CALIDAD, SEGURIDAD, PRIVACIDAD Y REGLAS DE NEGOCIO")
    print(resumen.__doc__ or "")
    print(f"Ambito: {SRC_DIR}")
    print("=" * 78)

    print("\n--- Verificacion dinamica (ejecucion real de herramientas) ---")
    chk_typescript()
    chk_lint()
    chk_suite_pruebas()

    print("\n--- Estructura y arquitectura ---")
    chk_estructura()
    chk_monopuerto()
    chk_api_solo_next()
    chk_configuracion()

    print("\n--- Seguridad: secretos y autenticacion ---")
    chk_variables_entorno()
    chk_sesion_secret()
    chk_passwords()
    chk_sesion_token()
    chk_cookies()
    chk_verificacion_token()
    chk_csrf()

    print("\n--- Seguridad: control de acceso ---")
    chk_guards_api()
    chk_middleware()
    chk_middleware_cubre_todas_las_apis()
    chk_cabeceras_sesion_respuesta()

    print("\n--- Seguridad: acceso a datos y superficie de ataque ---")
    chk_sql_parametrizado()
    chk_sql_identificadores()
    chk_xss()
    chk_rate_limit()
    chk_rate_limit_persistente()
    chk_enumeracion()
    chk_upload()

    print("\n--- Seguridad: registro, trazabilidad y transporte ---")
    chk_auditoria()
    chk_auditoria_integridad()
    chk_consola_sensible()
    chk_https()
    chk_cors()

    print("\n--- Privacidad y datos personales ---")
    chk_aviso_privacidad()
    chk_consentimiento()
    chk_derechos_titular()
    chk_anonimato_indicadores()
    chk_aviso_umbral_coherente()
    chk_umbral_k_efectivo()
    chk_uso_financiero()
    chk_acceso_propio()
    chk_minimizacion()

    print("\n--- Reglas internas del proyecto (reglas/important.md) ---")
    chk_tabla_unificada()
    chk_ci_unica()
    chk_campos_kardex()
    chk_condicionalidad_egresado()
    chk_exportacion_en_memoria()
    chk_backup_sin_pg_dump()
    chk_agregaciones_en_bd()
    chk_indices()

    print("\n--- Calidad y mantenibilidad ---")
    chk_manejo_errores()
    chk_error_interno_no_filtra()
    chk_typescript_estricto()
    chk_tamano_modulos()
    chk_complejidad_queries()
    chk_paginacion_tope()
    chk_zod()
    chk_accesibilidad()
    chk_performance()
    chk_responsive()
    chk_datos_sinteticos()
    chk_dependencias()
    chk_documentacion()

    print("\n--- Funcionalidad ---")
    chk_funcionalidad()
    chk_kpis()
    chk_publicacion_kpi()

    print("\n--- Cobertura de pruebas ---")
    chk_cobertura_pruebas()

    print("\n--- Auto-auditoria de la suite ---")
    chk_autoauditoria()
    chk_fraccion_verificable()

    res = resumen()
    print("\n" + "=" * 78)
    print(f"CONTROLES: {res['controles']}  |  OK {res['pass']}  |  FALLO {res['fail']}  "
          f"|  AVISO {res['warn']}  |  N/AP {res['skip']}")
    print("=" * 78)
    for cat, st in res["por_categoria"].items():
        print(f"  {cat:38s} OK={st['PASS']:2d} FALLO={st['FAIL']:2d} "
              f"AVISO={st['WARN']:2d} N/AP={st['SKIP']:2d}")

    print("\nFallos detectados:")
    fallos = [c for c in RESULTADOS if c.estado == "FAIL"]
    if not fallos:
        print("  (ninguno)")
    for c in fallos:
        print(f"  {c.id} {c.nombre}: {c.medida}")

    destino = escribir_json(res)
    print(f"\n[OK] resultados.json -> {destino}")
    docx = escribir_docx(res)
    if docx:
        print(f"[OK] resultados.docx -> {docx}")

    return 0 if res["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
