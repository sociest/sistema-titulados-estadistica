"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ShieldCheck, User, Award } from "lucide-react";

interface PdfSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cargo: string, nombre: string) => Promise<void> | void;
  aviso?: string;
}

export default function PdfSignatureModal({
  isOpen,
  onClose,
  onConfirm,
  aviso,
}: PdfSignatureModalProps) {
  const [cargo, setCargo] = useState<string>("");
  const [cargoOtro, setCargoOtro] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const CARGO_OPTIONS = ["Lic.", "M. Sc.", "Ph.", "Otro"] as const;

  const validateNombre = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "El nombre es obligatorio";
    const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 3) return "El nombre debe tener al menos 3 palabras";
    for (const word of words) {
      if (word.length < 3) return "Cada palabra debe tener al menos 3 letras";
    }
    return null;
  };

  const validateCargo = (): string | null => {
    if (!cargo) return "Debe seleccionar un cargo";
    if (cargo === "Otro" && !cargoOtro.trim()) return "Debe especificar el cargo";
    return null;
  };

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setError("");
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setError("");
    const cargoError = validateCargo();
    const nombreError = validateNombre(nombre);
    if (cargoError || nombreError) {
      setError([cargoError, nombreError].filter(Boolean).join(" · "));
      return;
    }
    const cargoFinal = cargo === "Otro" ? cargoOtro.trim() : cargo;
    setLoading(true);
    try {
      await onConfirm(cargoFinal, nombre.trim());
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Firma para el Informe PDF
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ingrese sus datos para la firma del informe
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Cargo Selection */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              Cargo <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CARGO_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setCargo(option);
                    if (option !== "Otro") setCargoOtro("");
                  }}
                  disabled={loading}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition ${
                    cargo === option
                      ? "border-amber-600 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-300"
                      : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            {cargo === "Otro" && (
              <input
                type="text"
                value={cargoOtro}
                onChange={(e) => setCargoOtro(e.target.value)}
                placeholder="Especifique el cargo"
                disabled={loading}
                className="mt-2 w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            )}
          </div>

          {/* Nombre Input */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              Nombre completo <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Carlos Pérez"
                disabled={loading}
                className="w-full px-10 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mínimo 3 palabras, cada una con al menos 3 letras
            </p>
          </div>

          {aviso && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-emerald-600" />
              {aviso}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-amber-700 hover:bg-amber-800 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generando…
                </>
              ) : (
                <>
                  <Award className="w-4 h-4" />
                  Generar PDF con firma
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}