"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Download, Layers, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import KardexNav from "@/components/KardexNav";

interface HojaOmitida {
  hoja: string;
  motivo: string;
}

interface Resultado {
  archivo: string;
  totalFilas: number;
  insertadas: number;
  actualizadas: number;
  rechazadas: number;
  registrosIncompletos?: number;
  hojasProcesadas?: string[];
  hojasOmitidas?: HojaOmitida[];
  detalleRechazadas: Array<{ hoja?: string; fila: number; ci: string; motivo: string }>;
  detalleTruncado: boolean;
}

interface OpcionConflicto {
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
}

interface ConflictoCi {
  ci: string;
  opciones: OpcionConflicto[];
}

interface DatosResolucion {
  archivo: string;
  hojasProcesadas: string[];
  hojasOmitidas: HojaOmitida[];
  fuentes: string[];
  conflictos: ConflictoCi[];
}

const COLUMNAS_PLANTILLA = [
  "tipo",
  "nombres_apellidos",
  "cedula_identidad",
  "genero",
  "semestre_ingreso",
  "semestre_egreso",
  "anio_egreso",
  "anio_titulacion",
  "modalidad_titulacion",
  "area_especializacion",
  "planea_titularse",
  "inicio_proceso_titulacion",
  "motivo_no_titulacion",
  "correo_electronico",
  "telefono",
  "redes_sociales",
  "ciudad_region_trabajo",
  "estado_laboral",
  "sector_trabajo",
  "sector_trabajo_otro",
  "ocupacion_cargo",
  "trabaja_en_estadistica",
  "tiempo_egreso_titulacion_meses",
  "tiempo_insercion_laboral_meses",
  "observaciones",
];

const FILAS_EJEMPLO = [
  [
    "TITULADO",
    "BENSON FLORES MENDEZ",
    "99999901",
    "MASCULINO",
    "I/2016",
    "II/2020",
    2020,
    2021,
    "TESIS",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  [
    "EGRESADO",
    "FLOR LOPEZ HURTADO",
    "99999902",
    "FEMENINO",
    "II/2018",
    "I/2023",
    2023,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
];

const PLANTILLA = [
  COLUMNAS_PLANTILLA.join(","),
  ...FILAS_EJEMPLO.map((fila) => fila.map((v) => String(v ?? "")).join(",")),
].join("\n");

export default function AdminImportarPage() {
  const { user, loading: authLoading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [sobrescribir, setSobrescribir] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState("");
  const [conflictoModal, setConflictoModal] = useState<DatosResolucion | null>(null);
  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const [modoSeleccion, setModoSeleccion] = useState<string>("mix");

  const elegir = (f: File | null) => {
    setArchivo(f);
    setResultado(null);
    setError("");
    setConflictoModal(null);
    setSelecciones({});
  };

  const enviarImportacion = async (resoluciones?: Record<string, string>) => {
    if (!archivo) return;
    setSubiendo(true);
    setResultado(null);
    setError("");

    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("sobrescribir", String(sobrescribir));
      if (resoluciones) {
        fd.append("resoluciones", JSON.stringify(resoluciones));
      }

      const res = await fetch("/api/importar", { method: "POST", body: fd });
      const j = await res.json();

      if (!res.ok) {
        if (Array.isArray(j.hojasOmitidas) && j.hojasOmitidas.length > 0) {
          setError(
            `${j.error ?? "No se pudo procesar el archivo"} (${j.hojasOmitidas
              .map((h: HojaOmitida) => `${h.hoja}: ${h.motivo}`)
              .join(" · ")})`
          );
        } else {
          setError(j.error ?? "No se pudo procesar el archivo");
        }
        return;
      }

      if (j.requiereResolucion) {
        const iniciales: Record<string, string> = {};
        for (const c of j.conflictos as ConflictoCi[]) {
          if (c.opciones[0]) iniciales[c.ci] = c.opciones[0].idOpcion;
        }
        setSelecciones(iniciales);
        setModoSeleccion(j.fuentes?.[0] ? `fuente:${j.fuentes[0]}` : "mix");
        setConflictoModal(j as DatosResolucion);
        return;
      }

      setConflictoModal(null);
      setResultado(j as Resultado);
    } catch {
      setError("Error de red al subir el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  const aplicarFuenteGlobal = (nombreHoja: string) => {
    if (!conflictoModal) return;
    const nuevas: Record<string, string> = { ...selecciones };
    for (const c of conflictoModal.conflictos) {
      const encontrada = c.opciones.find((o) => o.hoja === nombreHoja);
      if (encontrada) nuevas[c.ci] = encontrada.idOpcion;
    }
    setSelecciones(nuevas);
    setModoSeleccion(`fuente:${nombreHoja}`);
  };

  const confirmarResolucion = () => {
    void enviarImportacion(selecciones);
  };

  const descargarPlantilla = () => {
    const blob = new Blob(["\uFEFF" + PLANTILLA], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_importacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarPlantillaExcel = async () => {
    const XLSX = await import("xlsx");
    const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA, ...FILAS_EJEMPLO]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Sheet1");
    XLSX.writeFile(libro, "plantilla_importacion.xlsx");
  };

  const REGLAS_IMPORTACION = (
    <>
      <li>
        Solo son obligatorios <b>tipo</b> (<code>TITULADO</code> o <code>EGRESADO</code>), <b>nombres_apellidos</b>, <b>cedula_identidad</b> y <b>genero</b> (<code>MASCULINO</code> o <code>FEMENINO</code>). Todo lo demás (semestres, años, modalidad, correo, etc.) es opcional: si falta algún dato académico, el registro ingresa igual y quedará resaltado en rojo en la lista de personas para completarlo después.
      </li>
      <li>
        Los archivos Excel pueden tener <b>varias hojas</b>: se revisan todas. Si una hoja tiene error o le faltan columnas obligatorias, se omite indicando el motivo y continúa con las demás.
      </li>
      <li>
        Si una misma <b>cédula</b> aparece repetida en más de una hoja o fila, se abrirá una ventana para elegir de qué fuente conservar cada registro (todo de una hoja o combinación mixta).
      </li>
      <li>
        Normalización automática: los nombres y valores se limpian y convierten a <b>MAYÚSCULAS</b> preservando <b>Ñ</b>, tildes (<b>Á, É, Í, Ó, Ú</b>) y apóstrofes (ej. <code>laleshk&apos;a</code> → <code>LALESHK&apos;A</code>). Acepta errores de mayúsculas/minúsculas en género (ej. <code>MASculino</code> → <code>MASCULINO</code>) y siglas en modalidad: <code>EG</code> / <code>E.G.</code> → <code>EXAMEN DE GRADO</code>, <code>TG</code> / <code>TD</code> → <code>TRABAJO DIRIGIDO</code>, <code>PG</code> → <code>PROYECTO DE GRADO</code>, <code>EXCELENCIA</code>.
      </li>
      <li>
        Si la cédula ya existe en la base de datos, la fila se rechaza <b>a menos que marques &quot;Sobrescribir&quot;</b>.
      </li>
      <li>El archivo se procesa en memoria y no queda almacenado en el servidor.</li>
    </>
  );

  if (authLoading) {
    return <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Verificando sesión…</div>;
  }
  if (!user || (user.rol !== "admin" && user.rol !== "KARDEX")) return null;
  const esKardex = user.rol === "KARDEX";

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {esKardex && <KardexNav activa="importar" />}

      <div className="flex items-center gap-3">
        <Link href={esKardex ? "/kardex/solicitudes" : "/admin/dashboard"} className="inline-flex items-center gap-2 text-sm font-bold px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
          <ArrowLeft className="w-4 h-4" /> {esKardex ? "Portal Kardex" : "Dashboard"}
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Upload className="w-6 h-6 text-teal-700 dark:text-teal-400" />
            Importación masiva
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Carga de titulados y egresados desde Excel (multi-hoja) o CSV
          </p>
        </div>
      </div>

      {/* Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files?.[0] ?? null); }}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-teal-500 transition"
        >
          <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {archivo ? archivo.name : "Arrastre el archivo o haga clic para elegirlo"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Formatos: .csv, .xlsx, .xls · Máximo 20 MB y 50.000 filas
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void descargarPlantillaExcel()}
              className="inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition">
              <FileSpreadsheet className="w-4 h-4" /> Descargar plantilla Excel (.xlsx)
            </button>
            <button onClick={descargarPlantilla}
              className="inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <Download className="w-4 h-4" /> Descargar plantilla CSV (.csv)
            </button>
          </div>

          <div className="flex gap-2">
            {archivo && (
              <button onClick={() => elegir(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Quitar
              </button>
            )}
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={sobrescribir}
                onChange={(e) => setSobrescribir(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Sobrescribir si la cédula ya existe
            </label>
            <button
              onClick={() => void enviarImportacion()}
              disabled={!archivo || subiendo}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-40"
            >
              {subiendo ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</> : "Importar registros"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {resultado && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Filas leídas", valor: resultado.totalFilas, color: "text-slate-900 dark:text-white" },
              { label: "Insertadas", valor: resultado.insertadas, color: "text-emerald-700 dark:text-emerald-400" },
              { label: "Actualizadas", valor: resultado.actualizadas, color: "text-blue-700 dark:text-blue-400" },
              { label: "Rechazadas", valor: resultado.rechazadas, color: "text-red-600 dark:text-red-400" },
            ].map((c) => (
              <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-center">
                <p className={`text-3xl font-black ${c.color}`}>{c.valor}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {resultado.hojasProcesadas && resultado.hojasProcesadas.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <span>Hojas procesadas: <b>{resultado.hojasProcesadas.join(", ")}</b></span>
            </div>
          )}

          {resultado.hojasOmitidas && resultado.hojasOmitidas.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Hojas omitidas por error ({resultado.hojasOmitidas.length}):
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {resultado.hojasOmitidas.map((h, i) => (
                  <li key={i}><b>{h.hoja}:</b> {h.motivo}</li>
                ))}
              </ul>
            </div>
          )}

          {resultado.insertadas > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Titulados/egresados añadidos con éxito ({resultado.insertadas}). Para su primer ingreso al portal deben utilizar su C.I.
              </span>
            </div>
          )}

          {resultado.actualizadas > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Se actualizaron {resultado.actualizadas} registros existentes de <b>{resultado.archivo}</b>.
            </div>
          )}

          {(resultado.registrosIncompletos ?? 0) > 0 && (
            <div className="bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-xs text-red-800 dark:text-red-200 flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <b>{resultado.registrosIncompletos}</b> registro(s) importado(s) tienen datos faltantes y aparecerán remarcados en rojo en el padrón para su actualización.
                </span>
              </span>
              <Link href="/admin/personas" className="font-bold underline hover:text-red-950 dark:hover:text-white">
                Ir a Registrar Personas →
              </Link>
            </div>
          )}

          {resultado.detalleRechazadas.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h2 className="font-black text-sm text-slate-900 dark:text-white">
                  Filas rechazadas ({resultado.rechazadas})
                </h2>
              </div>
              {resultado.detalleTruncado && (
                <p className="px-4 py-2 text-[11px] bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                  Se muestran solo las primeras 200. Corrija el archivo y vuelva a importarlo.
                </p>
              )}
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                    <tr className="text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                      <th className="py-2 px-4">Hoja</th>
                      <th className="py-2 px-4">Fila</th>
                      <th className="py-2 px-4">Cédula</th>
                      <th className="py-2 px-4">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resultado.detalleRechazadas.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 px-4 text-slate-600 dark:text-slate-300 font-medium">{r.hoja || "—"}</td>
                        <td className="py-2 px-4 text-slate-500 dark:text-slate-400">{r.fila || "—"}</td>
                        <td className="py-2 px-4 font-mono text-slate-700 dark:text-slate-300">{r.ci || "—"}</td>
                        <td className="py-2 px-4 text-red-700 dark:text-red-400">{r.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ayuda */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <h2 className="font-black text-sm text-slate-900 dark:text-white mb-3">Reglas de la importación</h2>
        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 list-disc pl-5">
          {REGLAS_IMPORTACION}
        </ul>
      </div>

      {/* Modal de resolución de cédulas duplicadas entre hojas */}
      {conflictoModal && (
        <div className="fixed inset-0 z-[120] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  Registros repetidos detectados ({conflictoModal.conflictos.length} C.I.)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Las siguientes cédulas aparecen en más de una hoja o fila. Elige qué fuente deseas conservar antes de importar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConflictoModal(null)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Botones de selección global / mixta */}
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
                Opción rápida:
              </span>
              {conflictoModal.fuentes.map((fuente, idx) => (
                <button
                  key={fuente}
                  type="button"
                  onClick={() => aplicarFuenteGlobal(fuente)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                    modoSeleccion === `fuente:${fuente}`
                      ? "bg-teal-700 text-white border-teal-700 shadow-sm"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Mantener Fuente {idx + 1}: {fuente}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setModoSeleccion("mix")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  modoSeleccion === "mix"
                    ? "bg-blue-900 text-white border-blue-900 shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Mix personalizado (elegir por C.I.)
              </button>
            </div>

            {/* Listado de conflictos */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {conflictoModal.hojasOmitidas.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <b>Hojas omitidas:</b>{" "}
                  {conflictoModal.hojasOmitidas.map((h) => `${h.hoja} (${h.motivo})`).join(" · ")}
                </div>
              )}

              {conflictoModal.conflictos.map((conflicto) => (
                <div
                  key={conflicto.ci}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                >
                  <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      C.I. {conflicto.ci}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {conflicto.opciones.length} apariciones
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {conflicto.opciones.map((op) => {
                      const seleccionada = selecciones[conflicto.ci] === op.idOpcion;
                      return (
                        <label
                          key={op.idOpcion}
                          className={`flex items-start gap-3 p-3.5 cursor-pointer transition ${
                            seleccionada
                              ? "bg-teal-50/70 dark:bg-teal-950/30"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`conflicto-${conflicto.ci}`}
                            checked={seleccionada}
                            onChange={() => {
                              setModoSeleccion("mix");
                              setSelecciones((prev) => ({ ...prev, [conflicto.ci]: op.idOpcion }));
                            }}
                            className="mt-1 h-4 w-4 text-teal-700 focus:ring-teal-600"
                          />
                          <div className="flex-1 min-w-0 text-xs space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-bold text-slate-800 dark:text-slate-100">
                                {op.hoja} · Fila {op.fila}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-bold">
                                {op.resumen.tipo}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">
                                {op.resumen.nombresApellidos}
                              </span>
                              {op.resumen.camposFaltantes.length > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold">
                                  Incompleto ({op.resumen.camposFaltantes.join(", ")})
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600 dark:text-slate-300">
                              Género: <b>{op.resumen.genero}</b> · Ingreso: <b>{op.resumen.semestreIngreso || "—"}</b> · Egreso:{" "}
                              <b>{op.resumen.semestreEgreso || "—"}</b> ({op.resumen.anioEgreso ?? "—"})
                              {op.resumen.tipo === "TITULADO" && (
                                <>
                                  {" "}· Titulación: <b>{op.resumen.anioTitulacion ?? "—"}</b> · Modalidad:{" "}
                                  <b>{op.resumen.modalidadTitulacion || "—"}</b>
                                </>
                              )}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConflictoModal(null)}
                disabled={subiendo}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarResolucion}
                disabled={subiendo}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50"
              >
                {subiendo ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</> : "Confirmar e importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
