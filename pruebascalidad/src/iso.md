\# Estándares y normas citadas en `test\_calidad2.py` — uso real por control



\## Tabla 1 — Resumen general



| Norma / Estándar | Qué es | Nº controles | Grado de uso | Cobertura real |

|---|---|---:|---|---|

| \*\*ISO/IEC 25010:2011\*\* | Modelo de calidad de producto software (8 características) | 24 | \*\*Alta\*\* — paraguas del bloque CALIDAD | Funcionalidad §8.2.2 · Fiabilidad §8.2.4 · Eficiencia §8.2.3 · Usabilidad §8.2.6 · Mantenibilidad §8.2.7 |

| \*\*ISO/IEC 27001:2022\*\* | Sistema de gestión de seguridad de la información | 2 | \*\*Media\*\* — solo Anexo A.8.16 | Registro de eventos y trazabilidad. NO cubre gestión organizacional |

| \*\*ISO/IEC 27002:2022\*\* | Catálogo de controles de seguridad | 23 | \*\*Alta\*\* — núcleo del bloque SEGURIDAD | §8.2 · §8.5 · §8.6 · §8.12 · §8.15 · §8.16 · §8.19 · §8.20 · §8.24 · §8.25 · §8.28 |

| \*\*ISO/IEC 29119-2 / -4\*\* | Pruebas de software: proceso y técnicas | 6 | \*\*Media\*\* — metodológica | DIN-03 suite en verde · DIN-04 cobertura por ámbito · AUD-01/02 auto-auditoría |

| \*\*ISO/IEC 27701\*\* | Extensión de 27001/27002 para privacidad (PIMS) | 3 | \*\*Baja\*\* — solo minimización | §8.5 minimización. NO se implementa un PIMS completo |

| \*\*Convención ASONA / práctica UMSA\*\* | K=5 como umbral de anonimato en estadística oficial | 1 | \*\*Referencia operativa\*\* (no ISO) | Fija el valor 5 como umbral estadístico |

| \*\*CPE Bolivia — art. 130\*\* | Derecho a la protección de datos personales | 5 | \*\*Obligatoria\*\* — ley aplicable | Aviso · consentimiento · derechos · intimidad · minimización |

| \*\*CPE Bolivia — art. 143\*\* | Derecho a la información | 1 | \*\*Obligatoria\*\* | Consentimiento informado |

| \*\*Ley 1405 Bolivia — art. 5\*\* | Secreto estadístico | 4 | \*\*Obligatoria\*\* — ley aplicable | Ningún dato individual publicable · K≥5 · supresión de inferencia |

| \*\*Ley 1405 Bolivia — art. 4-I\*\* | Fines exclusivamente estadísticos | 1 | \*\*Obligatoria\*\* | Prohibición de uso tributario / judicial / policial |

| \*\*OWASP\*\* (ASVS, Top 10, Password Storage, Session Mgmt, XSS, SQLi, Secure Headers, Input Validation, Authentication, Dependency Mgmt) | Guías técnicas de seguridad | 8 | \*\*Alta\*\* — criterio técnico concreto | Contraseñas · sesiones · inyección · XSS · rate limiting · cabeceras · validación · dependencias |

| \*\*WCAG 2.1 AA\*\* | Accesibilidad web | 1 | \*\*Declarada pero NO verificada\*\* | El control CAL-08 lo declara: no se ejecutó axe ni Lighthouse |

| \*\*`reglas/important.md`\*\* (interno) | Reglas propias del proyecto UMSA | 8 | \*\*Alta\*\* — reglas propias | Tabla unificada · CI único · Kardex · condicionalidad · exportación en memoria · sin pg\_dump · agregaciones en BD · índices |



\---



\## Tabla 2 — Controles invocados por norma



| Norma | Controles que la invocan |

|---|---|

| \*\*ISO/IEC 25010:2011\*\* | EST-01, EST-03, DIN-01, DIN-02, DIN-03, CAL-01, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09, CAL-10, CAL-11, CAL-12, CAL-13, CAL-14, REG-07, REG-08, FUN-01, FUN-02, FUN-03, AUD-01 |

| \*\*ISO/IEC 27001:2022\*\* | SEG-14, SEG-15 |

| \*\*ISO/IEC 27002:2022\*\* | SEG-01, SEG-02, SEG-03, SEG-04, SEG-05, SEG-06, SEG-07, SEG-08, SEG-09, SEG-10, SEG-11, SEG-12, SEG-13, SEG-16, SEG-17, SEG-18, SEG-19, SEG-20, SEG-21, SEG-22, SEG-23, CAL-02, CAL-12 |

| \*\*ISO/IEC 29119-2 / -4\*\* | DIN-03, DIN-04, PRI-04, AUD-01, AUD-02, FUN-01 |

| \*\*ISO/IEC 27701\*\* | PRI-04, PRI-08, PRI-09 |

| \*\*Convención ASONA / UMSA\*\* | PRI-04 |

| \*\*CPE Bolivia — art. 130\*\* | PRI-01, PRI-02, PRI-03, PRI-07, PRI-08 |

| \*\*CPE Bolivia — art. 143\*\* | PRI-02 |

| \*\*Ley 1405 — art. 5\*\* | PRI-04, PRI-05, PRI-09, FUN-03 |

| \*\*Ley 1405 — art. 4-I\*\* | PRI-06 |

| \*\*OWASP\*\* | SEG-06, SEG-07, SEG-09, SEG-11, SEG-12, SEG-16, CAL-07, CAL-13 |

| \*\*WCAG 2.1 AA\*\* | CAL-08 |

| \*\*`reglas/important.md`\*\* | REG-01, REG-02, REG-03, REG-04, REG-05, REG-06, REG-07, REG-08 |



\---



\## Tabla 3 — Mapeo control → norma → sección concreta



| Control | Norma | Sección / cláusula concreta | Qué mide |

|---|---|---|---|

| EST-01 | ISO/IEC 25010 | §8.2.7 Mantenibilidad | Estructura de carpetas App Router |

| EST-03 | ISO/IEC 25010 | §8.2.7 Mantenibilidad | API Routes usan `NextResponse` |

| DIN-01 | ISO/IEC 25010 | §8.2.4 Funcionalidad | `tsc --noEmit` devuelve 0 |

| DIN-02 | ISO/IEC 25010 | §8.2.5 Mantenibilidad | ESLint sin errores, ≤5 warnings |

| DIN-03 | ISO/IEC 29119-2 + ISO/IEC 25010 | §5 / §8.2.6 | Suite del proyecto 100% en verde |

| DIN-04 | ISO/IEC 29119-4 | §5 Cobertura | Ámbitos críticos con pruebas |

| CAL-01 | ISO/IEC 25010 | §8.2.4 Fiabilidad | 100% APIs con `try/catch` |

| CAL-02 | ISO/IEC 27002 | §8.16 Fuga de información | Error 500 no filtra detalle |

| CAL-03 | ISO/IEC 25010 | §8.2.7 Mantenibilidad | `strict=true` y <5% usos de `any` |

| CAL-04 | ISO/IEC 25010 | §8.2.7 Mantenibilidad | Cohesión ≤800 líneas/archivo |

| CAL-05 | ISO/IEC 25010 | §8.2.3 Eficiencia | Listados con `LIMIT` |

| CAL-06 | ISO/IEC 25010 | §8.2.3 Eficiencia | `perPage` acotado con `Math.min` |

| CAL-07 | OWASP Input Validation | — | 100% rutas de escritura con esquema |

| CAL-08 | WCAG 2.1 AA | — | ARIA / label / alt (estático, no axe) |

| CAL-09 | ISO/IEC 25010 | §8.2.3 Eficiencia | Memoización en componentes |

| CAL-10 | ISO/IEC 25010 | §8.2.6 Usabilidad | Puntos de ruptura Tailwind |

| CAL-11 | ISO/IEC 25010 | §8.2.7 Mantenibilidad | Config + migraciones SQL |

| CAL-12 | ISO/IEC 25010 + ISO/IEC 27002 | §8.2.4 + §8.16 | Seeds marcados como ficticios |

| CAL-13 | ISO/IEC 25010 + OWASP Dependency Mgmt | §8.2.7 | Superficie de dependencias |

| CAL-14 | ISO/IEC 25010 | §8.2.7 Mantenibilidad | README con secciones clave |

| SEG-01 | ISO/IEC 27002 | §8.24 Información sensible | `.env` ignorado, sin secretos reales |

| SEG-02 | ISO/IEC 27002 | §8.24 Información sensible | `SESSION\_SECRET` ≥32 chars |

| SEG-03 | ISO/IEC 27002 | §8.2 Privilegios + §8.5 Autenticación | 100% APIs exigibles con guarda |

| SEG-04 | ISO/IEC 27002 | §8.2 Privilegios | Middleware con matcher |

| SEG-05 | ISO/IEC 27002 | §8.2 Privilegios | Defensa en profundidad (matcher cubre APIs) |

| SEG-06 | ISO/IEC 27002 + OWASP Password Storage | §8.24 | scrypt N=16384 + sal + `timingSafeEqual` |

| SEG-07 | ISO/IEC 27002 + OWASP Session Mgmt | §8.5 | HMAC + caducidad + revocación + aleatorio |

| SEG-08 | ISO/IEC 27002 | §8.5 Autenticación | Cookies con httpOnly + sameSite + secure |

| SEG-09 | ISO/IEC 27002 + OWASP SQLi | §8.28 Inyección | 0 concatenación SQL |

| SEG-10 | ISO/IEC 27002 | §8.28 Inyección | Identificadores dinámicos con lista blanca |

| SEG-11 | ISO/IEC 27002 + OWASP XSS | §8.28 Inyección | `dangerouslySetInnerHTML` sin datos de usuario |

| SEG-12 | ISO/IEC 27002 + OWASP Authentication | §8.6 Fallos de autenticación | Rate limit por IP y por ID |

| SEG-13 | ISO/IEC 27002 | §8.6 Fallos de autenticación | Limitador coherente con nº réplicas |

| SEG-14 | ISO/IEC 27001 + ISO/IEC 27002 | A.8.16 + §8.15 | Auditoría en 100% rutas de escritura |

| SEG-15 | ISO/IEC 27001 | A.8.16 | Hash encadenado en auditoría |

| SEG-16 | ISO/IEC 27002 + OWASP Secure Headers | §8.24 Canal seguro | 5 cabeceras de seguridad |

| SEG-17 | ISO/IEC 27002 | §8.20 Seguridad de red | CORS cerrado (sin `\*`) |

| SEG-18 | ISO/IEC 27002 | §8.12 Logging | Consola sin datos sensibles |

| SEG-19 | ISO/IEC 27002 | §8.19 Suplantación | `sameSite` + sin credenciales en URL |

| SEG-20 | ISO/IEC 27002 | §8.25 Gestión de datos | Carga con MIME y tamaño acotados |

| SEG-21 | ISO/IEC 27002 | §8.5 Autenticación | Token de un solo uso con caducidad |

| SEG-22 | ISO/IEC 27002 | §8.16 Fuga de información | Alta pública sin enumeración |

| SEG-23 | ISO/IEC 27002 | §8.16 Fuga de información | 401/403 uniformes sin detalle |

| PRI-01 | CPE Bolivia | art. 130 | Aviso en puntos de recogida |

| PRI-02 | CPE Bolivia | art. 130 + art. 143 | Consentimiento explícito |

| PRI-03 | CPE Bolivia | art. 130 | 4 derechos con vía real |

| PRI-04 | Ley 1405 + ISO/IEC 27701 + ISO/IEC 29119 | art. 5 + §8.5 | K\_MIN ≥ 5 |

| PRI-05 | Ley 1405 | art. 5 | Umbral anunciado = umbral aplicado |

| PRI-06 | Ley 1405 | art. 4-I | Prohibición de uso no estadístico |

| PRI-07 | CPE Bolivia | art. 130 Intimidad | Titular solo ve su ficha |

| PRI-08 | CPE Bolivia + ISO/IEC 27701 | art. 130 + §8.5 | Minimización (≥20% opcionales) |

| PRI-09 | Ley 1405 + ISO/IEC 27701 | art. 5 + §8.5 | `muestraSuficiente(n,k)` compara con k |

| REG-01 | `important.md` | §1 | Tabla unificada con discriminador |

| REG-02 | `important.md` | §1 | Cédula UNIQUE + índice único |

| REG-03 | `important.md` | §1 | 8 campos Kardex + solo admin |

| REG-04 | `important.md` | §1 | Condicionalidad del egresado |

| REG-05 | `important.md` | §2 | Exportación en memoria (sin disco) |

| REG-06 | `important.md` | §2 | Backups sin `pg\_dump` |

| REG-07 | ISO/IEC 25010 + `important.md` | §8.2.3 + §3 | Agregaciones en BD |

| REG-08 | ISO/IEC 25010 + `important.md` | §8.2.3 + §3 | Índices declarados |

| FUN-01 | ISO/IEC 25010 + ISO/IEC 29119 | §8.2.2 + §4 | 13 capacidades del plan |

| FUN-02 | ISO/IEC 25010 | §8.2.2 Funcionalidad | KPI con agregaciones SQL |

| FUN-03 | Ley 1405 + ISO/IEC 25010 | art. 5 + §8.2.2 | KPI devuelve null bajo K |

| AUD-01 | ISO/IEC 29119-2 + ISO/IEC 25010 | §5.6 + §8.2.7 | Suite se auto-audita |

| AUD-02 | ISO/IEC 29119-2 | §5.6 | Proporción de controles con ejecución real |



\---



\## Tabla 4 — Cobertura declarada vs. cobertura real



| Bloque | Controles | Norma principal | ¿Verificación dinámica? | Límite declarado |

|---|---|---|---|---|

| Dinámicos | DIN-01, DIN-02, DIN-03 | ISO 25010 + ISO 29119 | \*\*Sí\*\* — `tsc`, `next lint`, `node --test` | Requiere `node\_modules`; no re-ejecutables en el zip |

| Cobertura de pruebas | DIN-04 | ISO/IEC 29119-4 | No — análisis por palabras clave | Sin cobertura de UI, HTTP ni BD |

| Estructura | EST-01, EST-02, EST-03 | ISO 25010 + `important.md` | No — estático | — |

| Seguridad | SEG-01 … SEG-23 | ISO 27001 / 27002 + OWASP | No — estático | Sin pentest, sin `npm audit` |

| Privacidad | PRI-01 … PRI-09 | CPE + Ley 1405 + ISO 27701 | No — estático | Sin verificación de consentimiento en runtime |

| Reglas de negocio | REG-01 … REG-08 | `important.md` | No — estático | Sin pruebas de integración contra PostgreSQL |

| Calidad | CAL-01 … CAL-14 | ISO 25010 + OWASP | No — estático | Sin axe, sin Lighthouse, sin carga |

| Funcionalidad | FUN-01 … FUN-03 | ISO 25010 + Ley 1405 | No — estático | Existencia y contenido, no comportamiento |

| Auto-auditoría | AUD-01, AUD-02 | ISO 29119-2 | Sí — audita la propia suite | — |



\---



\## Tabla 5 — Lo que \*\*no\*\* está cubierto (declarado en `resumen.md` §1)



| No cubierto | Norma que lo cubriría | Herramienta que faltaría |

|---|---|---|

| Vulnerabilidades de dependencias | ISO 27002 §8.30 / OWASP A06 | `npm audit`, `osv-scanner`, `snyk` |

| Pentest | ISO 27001 A.8.8 / OWASP WSTG | `zap`, `burp`, `nuclei` |

| Accesibilidad real | WCAG 2.1 AA | `axe-core`, `pa11y`, Lighthouse |

| Comportamiento con PostgreSQL en ejecución | ISO 29119-4 | `testcontainers`, pruebas de integración |

| Carga y rendimiento | ISO 25010 §8.2.3 | `k6`, `artillery`, `autocannon` |

| Cifrado en reposo de la BD | ISO 27002 §8.24 | Configuración PostgreSQL (TDE o similar) |

| Gestión de incidentes / continuidad | ISO 27001 A.5.24–A.5.30 | Proceso organizacional, no código |

| Formación y concienciación | ISO 27001 A.6.3 | Proceso, no código |

