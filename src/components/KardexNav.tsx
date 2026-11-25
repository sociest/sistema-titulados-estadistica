"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileCheck2, FileSpreadsheet, Upload, Users } from "lucide-react";
import ExportModal from "@/components/ExportModal";

interface KardexNavProps {
  activa: "solicitudes" | "personas" | "importar";
  /** Si la página ya incluye sus propios botones de exportación (ej. /admin/personas), oculta este bloque para no duplicarlo. */
  ocultarExportar?: boolean;
}

export default function KardexNav({ activa, ocultarExportar = false }: KardexNavProps) {
  const [tipoExport, setTipoExport] = useState<"TODOS" | "TITULADOS" | "EGRESADOS">("TODOS");
  const [exportModal, setExportModal] = useState<{
    open: boolean;
    formato: "excel" | "csv";
    params: URLSearchParams;
  }>({ open: false, formato: "excel", params: new URLSearchParams() });
  const [exportError, setExportError] = useState<string | null>(null);

  const dispararDescarga = (url: string) => {
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.rel = "noopener";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  };

  const handleExport = (formato: "excel" | "csv") => {
    const params = new URLSearchParams();
    params.append("tipo", tipoExport);
    setExportError(null);
    setExportModal({ open: true, formato, params });
  };

  const confirmExport = async () => {
    setExportError(null);
    try {
      const res = await fetch("/api/exportar/enlace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destino: exportModal.formato,
          params: Object.fromEntries(exportModal.params.entries()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.error ?? "No se pudo generar el enlace de descarga.");
        return;
      }
      dispararDescarga(data.url);
      setExportModal((m) => ({ ...m, open: false }));
    } catch {
      setExportError("Error de red al generar el enlace de descarga.");
    }
  };

  const etiquetaTipo =
    tipoExport === "TITULADOS"
      ? "titulados"
      : tipoExport === "EGRESADOS"
        ? "egresados"
        : "titulados y egresados";

  const btnInactivo =
    "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 transition";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/kardex/solicitudes"
            className={
              activa === "solicitudes"
                ? "inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition"
                : btnInactivo
            }
          >
            {activa === "solicitudes" ? (
              <FileCheck2 className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            )}
            Solicitudes de Titulación
          </Link>
          <Link
            href="/admin/personas"
            className={
              activa === "personas"
                ? "inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition"
                : btnInactivo
            }
          >
            <Users className={activa === "personas" ? "h-4 w-4" : "h-4 w-4 text-blue-800 dark:text-blue-400"} />
            Registrar Personas
          </Link>
          <Link
            href="/admin/importar"
            className={
              activa === "importar"
                ? "inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition"
                : btnInactivo
            }
          >
            <Upload className={activa === "importar" ? "h-4 w-4" : "h-4 w-4 text-teal-700 dark:text-teal-400"} />
            Importar Usuarios (Excel / CSV)
          </Link>
        </div>

        {!ocultarExportar && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tipoExport}
              onChange={(e) => setTipoExport(e.target.value as "TODOS" | "TITULADOS" | "EGRESADOS")}
              aria-label="Tipo de registros a exportar"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos</option>
              <option value="TITULADOS">Titulados</option>
              <option value="EGRESADOS">Egresados</option>
            </select>
            <button
              type="button"
              onClick={() => handleExport("excel")}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              title="Generar Excel en memoria RAM"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              title="Generar CSV en memoria RAM"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        )}
      </div>

      {exportError && (
        <div className="fixed bottom-6 right-6 z-[150] max-w-sm rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-900 dark:text-red-200 shadow-lg">
          <b className="block font-bold">No se pudo descargar</b>
          {exportError}
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="mt-2 block text-xs font-bold underline"
          >
            Cerrar
          </button>
        </div>
      )}

      <ExportModal
        isOpen={exportModal.open}
        onClose={() => setExportModal((m) => ({ ...m, open: false }))}
        onConfirm={confirmExport}
        title={etiquetaTipo}
        formato={exportModal.formato}
        params={exportModal.params}
        aviso="La descarga se realiza mediante un enlace seguro que caduca en 5 minutos y solo puede usarse desde esta sesión."
      />
    </>
  );
}
