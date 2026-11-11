"use client";

import { useEffect, useState } from "react";
import { X, Download, FileSpreadsheet, FileText, Loader2, ShieldCheck } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  formato: "excel" | "csv";
  params: URLSearchParams;
  /** Aviso de seguridad que se muestra sobre los botones. */
  aviso?: string;
}

type PreviewRow = Record<string, string | number>;

export default function ExportModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  formato,
  params,
  aviso,
}: ExportModalProps) {
  const [data, setData] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const fetchPreview = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/exportar/preview?${params.toString()}`);
        if (!res.ok) throw new Error("Error al cargar datos");
        const json = await res.json();
        setData(json.data || []);
      } catch (err) {
        setError("No se pudieron cargar los datos para previsualizar.");
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [isOpen, params]);

  if (!isOpen) return null;

  const columns = data.length > 0 ? Object.keys(data[0]!) : [];

  /**
 * No se cierra el modal aquí: `onConfirm` es asíncrono (pide el enlace temporal al
 * servidor) y cerrarlo de inmediato se tragaría el mensaje de error si la descarga
 * falla. Quien lo cierra es el propio callback cuando la llamada termina bien.
 */
const handleConfirm = () => {
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
              {formato === "excel" ? (
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              ) : (
                <FileText className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Vista de datos de {title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Primeros {data.length} registros (máximo 50 en previsualización)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Cargando datos...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay datos para mostrar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap"
                        >
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          {aviso && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-emerald-600" />
              {aviso}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition"
            >
              <Download className="w-4 h-4" />
              Sí, exportar datos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
