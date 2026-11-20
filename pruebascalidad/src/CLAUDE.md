# CLAUDE.md — Plan de revisión de la suite de calidad

Alcance: **solo `pruebascalidad/src/`**. No se toca el código del sistema.
Entorno de revisión: sin `node_modules` ni red, así que DIN-01..03 (tsc, lint, node --test) **no se pudieron re-ejecutar**; sus cifras (74/83) vienen del informe original y quedan marcadas como no reverificadas.

## Veredicto de la revisión

El informe es mayormente fiable (K_MIN=1, aviso de "menos de 5" y comentario del dashboard se confirmaron en el código), pero tiene un error de fondo y varias inconsistencias:

1. **Error de fondo:** el informe dice que `K_MIN = 5` cierra PRI-04/05 y las 11 pruebas. Falso: `muestraSuficiente(n, k)` ignora `k` (solo evalúa `n > 0`) y `aplicarKAnonimato` hace `return` temprano si `k <= 1`. Con K_MIN=5 y esa función, **no se suprimiría ningún grupo**. La suite no lo detectaba.
2. Conteos inconsistentes (65 / 64 / 63 controles; "4/65", "4/64", "4/61"; "61 estáticos", "60", "57").
3. DIN-04 (análisis de cobertura) se cuenta como "ejecución real" pero no ejecuta ninguna herramienta: son 3 dinámicos reales, no 4.
4. `resumen.md` con texto corrupto (línea `# Wrote...`, "detected", "favour", "proportionmente", "individuals") y orden de corrección que omite la causa real.
5. CAL-11 falla en el zip revisado (no hay carpeta `drizzle/`), pero no figura en el informe original: hay que aclarar si el zip está incompleto.

## Tareas

- [x] T1. Verificar contra el código: K_MIN=1, aviso "menos de 5", comentario del dashboard
- [x] T2. Detectar que `muestraSuficiente` ignora `k` y que `aplicarKAnonimato` corta con `k<=1`
- [x] T3. Añadir control **PRI-09** a `test_calidad2.py`: el umbral K se aplica de verdad
- [x] T4. Corregir AUD-02: contar solo controles que ejecutan herramientas (excluir análisis de DIN-04) y usar el mismo total que el resumen
- [x] T5. Re-ejecutar la suite (`--sin-dinamicos`; 66 controles, IDs únicos) y regenerar `resultados.json` / `resultados.docx`
- [x] T6. Reescribir `resumen.md`: cifras coherentes, causa real de PRI-04, texto limpio, límites de la revisión
- [x] T7. Confirmar cifras finales del `resumen.md` contra `resultados.json`

## Fuera de alcance (recomendaciones al equipo, no implementadas)

- Corregir `muestraSuficiente` para usar `k` y subir `K_MIN` a 5 (en `src/lib/privacidad.ts`).
- Consentimiento en portales, respaldo desde la app, validación de esquemas, cabeceras de seguridad.
