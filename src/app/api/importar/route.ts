import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personas, credencialesPersona } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exigirAdminOKardex, verificarCsrf, errorInterno, leerSesionVigente } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { personaImportacionSchema, primerErrorZod } from "@/lib/validaciones";
import { leerCsv } from "@/lib/csv";
import { invalidarCacheDashboard } from "@/lib/cacheDashboard";
import { hashPasswordAsync } from "@/lib/password";
import {
  aMayusculasLimpias,
  camposFaltantesPersona,
  normalizarGenero,
  normalizarModalidad,
  normalizarSemestre,
  normalizarTipo,
} from "@/lib/normalizacion";

export const dynamic = "force-dynamic";

const MAPA: Record<string, string> = {
  tipo: "tipo",
  nombres_apellidos: "nombresApellidos",
  cedula_identidad: "cedulaIdentidad",
  genero: "genero",
  semestre_ingreso: "semestreIngreso",
  semestre_egreso: "semestreEgreso",
  anio_egreso: "anioEgreso",
  anio_titulacion: "anioTitulacion",
  modalidad_titulacion: "modalidadTitulacion",
  area_especializacion: "areaEspecializacion",
  planea_titularse: "planeaTitularse",
  inicio_proceso_titulacion: "inicioProcesoTitulacion",
  motivo_no_titulacion: "motivoNoTitulacion",
  correo_electronico: "correoElectronico",
  telefono: "telefono",
  redes_sociales: "redesSociales",
  ciudad_region_trabajo: "ciudadRegionTrabajo",
  estado_laboral: "estadoLaboral",
  sector_trabajo: "sectorTrabajo",
  sector_trabajo_otro: "sectorTrabajoOtro",
  ocupacion_cargo: "ocupacionCargo",
  trabaja_en_estadistica: "trabajaEnEstadistica",
  tiempo_egreso_titulacion_meses: "tiempoEgresoTitulacionMeses",
  tiempo_insercion_laboral_meses: "tiempoInsercionLaboralMeses",
  observaciones: "observaciones",
};

const CAMPOS_UPPER = new Set([
  "planeaTitularse",
  "inicioProcesoTitulacion",
  "motivoNoTitulacion",
  "estadoLaboral",
  "sectorTrabajo",
]);

function aBooleano(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "si" || s === "sí" || s === "1" || s === "true" || s === "x";
}

interface HojaLeida {
  hoja: string;
  crudos: Record<string, unknown>[];
}

interface CandidatoValido {
  idOpcion: string;
  hoja: string;
  fila: number;
  ci: string;
  datos: typeof personas.$inferInsert;
}

export async function POST(req: NextRequest) {
  const denegado = await exigirAdminOKardex(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  try {
    const form = await req.formData();
    const archivo = form.get("archivo");
    const sobrescribir = form.get("sobrescribir") === "true";
    const resolucionesRaw = form.get("resoluciones");

    let resoluciones: Record<string, string> | null = null;
    if (typeof resolucionesRaw === "string" && resolucionesRaw.trim() !== "") {
      try {
        const parsed = JSON.parse(resolucionesRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          resoluciones = parsed as Record<string, string>;
        }
      } catch {
        return NextResponse.json({ error: "Formato inválido en resoluciones de duplicados" }, { status: 400 });
      }
    }

    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }
    if (archivo.size === 0) {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    }
    if (archivo.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo supera el máximo de 20 MB" }, { status: 400 });
    }

    const nombre = archivo.name.toLowerCase();
    const buffer = Buffer.from(await archivo.arrayBuffer());

    const hojasLeidas: HojaLeida[] = [];
    const hojasOmitidas: Array<{ hoja: string; motivo: string }> = [];

    if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(buffer, { type: "buffer" });
      if (!libro.SheetNames.length) {
        return NextResponse.json({ error: "El archivo Excel no tiene hojas" }, { status: 400 });
      }
      for (const nombreHoja of libro.SheetNames) {
        try {
          const hoja = libro.Sheets[nombreHoja];
          if (!hoja) {
            hojasOmitidas.push({ hoja: nombreHoja, motivo: "Hoja no legible o vacía" });
            continue;
          }
          const filasHoja = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
          if (!filasHoja.length) {
            hojasOmitidas.push({ hoja: nombreHoja, motivo: "La hoja está vacía o no tiene filas de datos" });
            continue;
          }
          hojasLeidas.push({ hoja: nombreHoja, crudos: filasHoja });
        } catch {
          hojasOmitidas.push({ hoja: nombreHoja, motivo: "Error al leer el contenido de la hoja" });
        }
      }
    } else if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
      let texto = buffer.toString("utf-8").replace(/^\uFEFF/, "");
      if (texto.includes("\uFFFD")) texto = buffer.toString("latin1");
      const filasCsv = leerCsv(texto);
      if (!filasCsv.length) {
        return NextResponse.json({ error: "El archivo no contiene filas de datos" }, { status: 400 });
      }
      hojasLeidas.push({ hoja: "CSV", crudos: filasCsv });
    } else {
      return NextResponse.json(
        { error: "Formato no admitido. Use un archivo .csv, .xlsx o .xls" },
        { status: 400 }
      );
    }

    const totalFilasBrutas = hojasLeidas.reduce((acc, h) => acc + h.crudos.length, 0);
    if (totalFilasBrutas > 50_000) {
      return NextResponse.json(
        { error: `El archivo tiene ${totalFilasBrutas} filas y el máximo permitido es 50.000` },
        { status: 400 }
      );
    }

    const rechazadas: Array<{ hoja: string; fila: number; ci: string; motivo: string }> = [];
    const candidatosValidos: CandidatoValido[] = [];
    const hojasProcesadas: string[] = [];
    let totalFilasProcesables = 0;

    for (const { hoja: nombreHoja, crudos } of hojasLeidas) {
      // Verificar que la hoja tenga al menos las columnas mínimas obligatorias
      const columnasPresentes = new Set<string>();
      for (const k of Object.keys(crudos[0] ?? {})) {
        const dest = MAPA[k.trim().toLowerCase()];
        if (dest) columnasPresentes.add(dest);
      }
      if (
        !columnasPresentes.has("cedulaIdentidad") ||
        !columnasPresentes.has("nombresApellidos") ||
        !columnasPresentes.has("tipo") ||
        !columnasPresentes.has("genero")
      ) {
        hojasOmitidas.push({
          hoja: nombreHoja,
          motivo: "Faltan columnas obligatorias (tipo, nombres_apellidos, cedula_identidad, genero)",
        });
        continue;
      }

      hojasProcesadas.push(nombreHoja);

      for (let i = 0; i < crudos.length; i++) {
        const crudo = crudos[i]!;
        const filaNum = i + 2;

        // Ignorar filas completamente en blanco
        const tieneAlgunValor = Object.values(crudo).some((v) => String(v ?? "").trim() !== "");
        if (!tieneAlgunValor) continue;

        totalFilasProcesables++;

        const normalizado: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(crudo)) {
          const destino = MAPA[k.trim().toLowerCase()];
          if (!destino || v === null || v === undefined) continue;
          const strVal = String(v).trim();
          if (strVal === "") continue;

          if (destino === "tipo") {
            normalizado[destino] = normalizarTipo(strVal);
          } else if (destino === "nombresApellidos") {
            normalizado[destino] = aMayusculasLimpias(strVal);
          } else if (destino === "genero") {
            normalizado[destino] = normalizarGenero(strVal);
          } else if (destino === "modalidadTitulacion") {
            normalizado[destino] = normalizarModalidad(strVal);
          } else if (destino === "semestreIngreso" || destino === "semestreEgreso") {
            const sem = normalizarSemestre(strVal);
            if (sem) normalizado[destino] = sem;
          } else if (CAMPOS_UPPER.has(destino)) {
            normalizado[destino] = aMayusculasLimpias(strVal);
          } else if (
            destino === "anioEgreso" ||
            destino === "anioTitulacion" ||
            destino === "tiempoEgresoTitulacionMeses" ||
            destino === "tiempoInsercionLaboralMeses"
          ) {
            normalizado[destino] = v;
          } else if (destino === "trabajaEnEstadistica") {
            normalizado[destino] = aBooleano(v);
          } else if (destino === "correoElectronico") {
            normalizado[destino] = strVal.toLowerCase();
          } else {
            normalizado[destino] = strVal;
          }
        }

        const ci = String(normalizado.cedulaIdentidad ?? "").trim().toUpperCase();
        if (!ci) {
          rechazadas.push({ hoja: nombreHoja, fila: filaNum, ci: "", motivo: "Falta la cédula de identidad" });
          continue;
        }
        normalizado.cedulaIdentidad = ci;

        const parseo = personaImportacionSchema.safeParse(normalizado);
        if (!parseo.success) {
          rechazadas.push({ hoja: nombreHoja, fila: filaNum, ci, motivo: primerErrorZod(parseo.error) });
          continue;
        }

        const d = parseo.data;
        const tiempoEgrTit =
          d.anioEgreso && d.anioTitulacion && d.anioTitulacion >= d.anioEgreso
            ? (d.anioTitulacion - d.anioEgreso) * 12
            : (d.tiempoEgresoTitulacionMeses ?? null);

        candidatosValidos.push({
          idOpcion: `${nombreHoja}:${filaNum}`,
          hoja: nombreHoja,
          fila: filaNum,
          ci,
          datos: { ...d, cedulaIdentidad: ci, tiempoEgresoTitulacionMeses: tiempoEgrTit },
        });
      }
    }

    if (!hojasProcesadas.length && hojasOmitidas.length > 0) {
      return NextResponse.json(
        {
          error: "Ninguna hoja del archivo pudo procesarse.",
          hojasOmitidas,
        },
        { status: 400 }
      );
    }

    // ── Agrupar por C.I. y detectar duplicados entre hojas o en el archivo ───
    const porCi = new Map<string, CandidatoValido[]>();
    for (const c of candidatosValidos) {
      const lista = porCi.get(c.ci) ?? [];
      lista.push(c);
      porCi.set(c.ci, lista);
    }

    const conflictos: Array<{
      ci: string;
      opciones: Array<{
        idOpcion: string;
        hoja: string;
        fila: number;
        resumen: {
          tipo: string;
          nombresApellidos: string;
          genero: string;
          semestreIngreso: string | null;
          semestreEgreso: string | null;
          anioEgreso: number | null;
          anioTitulacion: number | null;
          modalidadTitulacion: string | null;
          correoElectronico: string | null;
          camposFaltantes: string[];
        };
      }>;
    }> = [];

    const fuentesConflictosSet = new Set<string>();
    const seleccionados: CandidatoValido[] = [];

    for (const [ci, lista] of Array.from(porCi.entries())) {
      if (lista.length === 1) {
        seleccionados.push(lista[0]!);
        continue;
      }

      const idElegido = resoluciones?.[ci];
      const elegido = idElegido ? lista.find((item) => item.idOpcion === idElegido) : undefined;
      if (elegido) {
        seleccionados.push(elegido);
        continue;
      }

      for (const item of lista) fuentesConflictosSet.add(item.hoja);
      conflictos.push({
        ci,
        opciones: lista.map((item) => ({
          idOpcion: item.idOpcion,
          hoja: item.hoja,
          fila: item.fila,
          resumen: {
            tipo: String(item.datos.tipo ?? ""),
            nombresApellidos: String(item.datos.nombresApellidos ?? ""),
            genero: String(item.datos.genero ?? ""),
            semestreIngreso: item.datos.semestreIngreso ?? null,
            semestreEgreso: item.datos.semestreEgreso ?? null,
            anioEgreso: item.datos.anioEgreso ?? null,
            anioTitulacion: item.datos.anioTitulacion ?? null,
            modalidadTitulacion: item.datos.modalidadTitulacion ?? null,
            correoElectronico: item.datos.correoElectronico ?? null,
            camposFaltantes: camposFaltantesPersona({
              tipo: String(item.datos.tipo ?? ""),
              genero: item.datos.genero ?? null,
              semestreIngreso: item.datos.semestreIngreso ?? null,
              semestreEgreso: item.datos.semestreEgreso ?? null,
              anioEgreso: item.datos.anioEgreso ?? null,
              anioTitulacion: item.datos.anioTitulacion ?? null,
              modalidadTitulacion: item.datos.modalidadTitulacion ?? null,
            }),
          },
        })),
      });
    }

    if (conflictos.length > 0) {
      return NextResponse.json({
        requiereResolucion: true,
        archivo: archivo.name,
        hojasProcesadas,
        hojasOmitidas,
        fuentes: Array.from(fuentesConflictosSet),
        conflictos,
      });
    }

    // ── Verificar C.I. existentes en BD ──────────────────────────────────────
    const existentes = await db.select({ ci: personas.cedulaIdentidad }).from(personas);
    const yaEnBase = new Set(existentes.map((e) => e.ci));

    const insertables: (typeof personas.$inferInsert)[] = [];
    const actualizables: Array<{ ci: string; datos: typeof personas.$inferInsert }> = [];
    let registrosIncompletos = 0;

    for (const sel of seleccionados) {
      const faltantes = camposFaltantesPersona({
        tipo: String(sel.datos.tipo ?? ""),
        genero: sel.datos.genero ?? null,
        semestreIngreso: sel.datos.semestreIngreso ?? null,
        semestreEgreso: sel.datos.semestreEgreso ?? null,
        anioEgreso: sel.datos.anioEgreso ?? null,
        anioTitulacion: sel.datos.anioTitulacion ?? null,
        modalidadTitulacion: sel.datos.modalidadTitulacion ?? null,
      });

      if (yaEnBase.has(sel.ci)) {
        if (sobrescribir) {
          actualizables.push({ ci: sel.ci, datos: sel.datos });
          if (faltantes.length > 0) registrosIncompletos++;
        } else {
          rechazadas.push({
            hoja: sel.hoja,
            fila: sel.fila,
            ci: sel.ci,
            motivo: "La cédula ya está registrada en el sistema",
          });
        }
      } else {
        insertables.push(sel.datos);
        if (faltantes.length > 0) registrosIncompletos++;
      }
    }

    // ── Insertar por lotes y generar credencial inicial (password = CI) ──────
    let insertadas = 0;
    const paraCredencial: Array<{ id: number; ci: string }> = [];
    const LOTE = 500;
    for (let i = 0; i < insertables.length; i += LOTE) {
      const lote = insertables.slice(i, i + LOTE);
      try {
        const creadas = await db
          .insert(personas)
          .values(lote)
          .returning({ id: personas.id, ci: personas.cedulaIdentidad });
        insertadas += creadas.length;
        paraCredencial.push(...creadas);
      } catch {
        for (const fila of lote) {
          try {
            const [creada] = await db
              .insert(personas)
              .values(fila)
              .returning({ id: personas.id, ci: personas.cedulaIdentidad });
            if (creada) {
              insertadas++;
              paraCredencial.push(creada);
            }
          } catch {
            rechazadas.push({
              hoja: "",
              fila: 0,
              ci: fila.cedulaIdentidad as string,
              motivo: "Error de base de datos al insertar",
            });
          }
        }
      }
    }

    // ── Actualizar por lotes concurrentes acotados ───────────────────────────
    let actualizadas = 0;
    const LOTE_UPDATE = 25;
    const ahora = new Date();
    for (let i = 0; i < actualizables.length; i += LOTE_UPDATE) {
      const sublote = actualizables.slice(i, i + LOTE_UPDATE);
      const resultados = await Promise.allSettled(
        sublote.map(({ ci, datos }) =>
          db
            .update(personas)
            .set({ ...datos, actualizadoEn: ahora })
            .where(eq(personas.cedulaIdentidad, ci))
            .returning({ id: personas.id, ci: personas.cedulaIdentidad })
        )
      );
      resultados.forEach((res, idx) => {
        if (res.status === "fulfilled") {
          actualizadas++;
          if (res.value[0]) paraCredencial.push(res.value[0]);
        } else {
          rechazadas.push({
            hoja: "",
            fila: 0,
            ci: sublote[idx]!.ci,
            motivo: "Error de base de datos al actualizar",
          });
        }
      });
    }

    // ── Asegurar credencial inicial (password = CI) sin pisar claves ya cambiadas ─
    const LOTE_HASH = 25;
    for (let i = 0; i < paraCredencial.length; i += LOTE_HASH) {
      const sublote = paraCredencial.slice(i, i + LOTE_HASH);
      const filasCred = await Promise.all(
        sublote.map(async (p) => ({
          idPersona: p.id,
          passwordHash: await hashPasswordAsync(p.ci),
        }))
      );
      await db
        .insert(credencialesPersona)
        .values(filasCred)
        .onConflictDoNothing({ target: credencialesPersona.idPersona });
    }

    if (insertadas > 0 || actualizadas > 0) {
      invalidarCacheDashboard();
    }

    const sesion = await leerSesionVigente(req);
    await registrarAuditoria({
      accion: "importar",
      entidad: "personas",
      idUsuario: sesion?.sub ?? null,
      detalles: `Importación desde ${archivo.name} (hojas: ${hojasProcesadas.join(", ")}): ${insertadas} insertadas, ${actualizadas} actualizadas, ${rechazadas.length} rechazadas, ${hojasOmitidas.length} hojas omitidas`,
      req,
    });

    return NextResponse.json({
      requiereResolucion: false,
      archivo: archivo.name,
      totalFilas: totalFilasProcesables,
      insertadas,
      actualizadas,
      rechazadas: rechazadas.length,
      registrosIncompletos,
      hojasProcesadas,
      hojasOmitidas,
      detalleRechazadas: rechazadas.slice(0, 200),
      detalleTruncado: rechazadas.length > 200,
    });
  } catch (e) {
    return errorInterno(e, "api/importar");
  }
}
