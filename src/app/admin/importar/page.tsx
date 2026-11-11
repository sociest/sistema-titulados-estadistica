"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Download,
} from "lucide-react";

/**
 * Importación masiva desde Excel o CSV (PDF 4.2).
 *
 * El archivo se procesa EN MEMORIA en el servidor (`important.md` §2 prohíbe escribir en
 * disco, para que funcione igual en un servidor común o en un contenedor). Cada fila se
 * valida con el mismo esquema que el alta manual, y se devuelve el detalle de las
 * filas rechazadas con el motivo.
 */

interface Resultado {
  archivo: string;
  totalFilas: number;
  insertadas: number;
  rechazadas: number;
  detalleRechazadas: Array<{ fila: number; ci: string; motivo: string }>;
  detalleTruncado: boolean;
}

const PLANTILLA = `tipo,nombres_apellidos,cedula_identidad,genero,semestre_ingreso,semestre_egreso,anio_egreso,anio_titulacion,modalidad_titulacion,area_especializacion,planea_titularse,inicio_proceso_titulacion,motivo_no_titulacion,correo_electronico,telefono,redes_sociales,ciudad_region_trabajo,estado_laboral,sector_trabajo,sector_trabajo_otro,ocupacion_cargo,trabaja_en_estadistica,tiempo_egreso_titulacion_meses,tiempo_insercion_laboral_meses,observaciones
TITULADO,"Ana María Ñuñez Rojas",1234567,FEMENINO,I/2016,II/2020,2020,2021,Tesis,Bioestadística,,,,ana@example.com,71234567,linkedin.com/in/ana,La Paz Bolivia,EMPLEADO,PUBLICO,,Analista de Datos,SI,12,3,
EGRESADO,"Luis Carlos Pérez Soto",7654321,MASCULINO,II/2018,I/2023,2023,,,,SI,NO,LABORAL,luis@example.com,70123456,,Santa Cruz Bolivia,EMPLEADO,OTRO,Gobierno municipal,Técnico Estadístico,SI,,4,`;

export default function AdminImportarPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState("");

  const elegir = (f: File | null) => {
    setArchivo(f); setResultado(null); setError("");
  };

  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true); setResultado(null); setError("");

    try {
      const fd = new FormData();
      fd.append("archivo", archivo);

      const res = await fetch("/api/importar", { method: "POST", body: fd });
      const j = await res.json();

      if (!res.ok) { setError(j.error ?? "No se pudo procesar el archivo"); return; }
      setResultado(j);
    } catch {
      setError("Error de red al subir el archivo.");
    } finally {
      setSubiendo(false);
    }
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

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm font-bold px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Upload className="w-6 h-6 text-teal-700 dark:text-teal-400" />
            Importación masiva
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Carga de titulados y egresados desde Excel o CSV
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
          <button onClick={descargarPlantilla}
            className="inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <Download className="w-4 h-4" /> Descargar plantilla CSV
          </button>

          <div className="flex gap-2">
            {archivo && (
              <button onClick={() => elegir(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Quitar
              </button>
            )}
            <button
              onClick={subir}
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Filas leídas", valor: resultado.totalFilas, color: "text-slate-900 dark:text-white" },
              { label: "Insertadas", valor: resultado.insertadas, color: "text-emerald-700 dark:text-emerald-400" },
              { label: "Rechazadas", valor: resultado.rechazadas, color: "text-red-600 dark:text-red-400" },
            ].map((c) => (
              <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-center">
                <p className={`text-3xl font-black ${c.color}`}>{c.valor}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {resultado.insertadas > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Se importaron {resultado.insertadas} registros de <b>{resultado.archivo}</b>.
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
                      <th className="py-2 px-4">Fila</th>
                      <th className="py-2 px-4">Cédula</th>
                      <th className="py-2 px-4">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resultado.detalleRechazadas.map((r, i) => (
                      <tr key={i}>
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
          <li>La <b>cédula de identidad</b> es única: si ya existe en el sistema o se repite dentro del archivo, la fila se rechaza.</li>
          <li>Un <b>titulado</b> necesita año y modalidad de titulación.</li>
          <li>Un <b>egresado</b> necesita «¿Planea titularse?». Si responde Sí, necesita «¿Inició proceso?»; y si esa respuesta es No (o si respondió No/No sabe), necesita el motivo.</li>
          <li>Si el sector es <b>OTRO</b>, hay que llenar la columna <code>sector_trabajo_otro</code>.</li>
          <li>Valores de enum en mayúsculas exactamente como en la plantilla: <code>TITULADO</code>, <code>EMPLEADO</code>, <code>PUBLICO</code>, <code>SI</code>/<code>NO</code>.</li>
          <li>El archivo se procesa en memoria y no queda almacenado en el servidor.</li>
        </ul>
      </div>
    </div>
  );
}