"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, RefreshCw, X } from "lucide-react";

interface Documento {
  id: number;
  nombreOriginal: string;
  tipoMime: string;
  tamanoBytes: number;
}

interface Solicitud {
  id: number;
  ci: string;
  nombreSolicitante: string;
  fechaSolicitud: string;
  documentos: Documento[];
}

export default function SolicitudesKardexPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [detalles, setDetalles] = useState<Record<number, string>>({});
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    let activa = true;
    setCargando(true);
    fetch("/api/kardex/solicitudes", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "No se pudieron cargar las solicitudes");
        return body as Solicitud[];
      })
      .then((rows) => { if (activa) { setSolicitudes(rows); setError(""); } })
      .catch((e: Error) => { if (activa) setError(e.message); })
      .finally(() => { if (activa) setCargando(false); });
    return () => { activa = false; };
  }, [version]);

  async function decidir(solicitud: Solicitud, estado: "ACEPTADO" | "RECHAZADO") {
    const detalle = detalles[solicitud.id]?.trim() || "";
    if (estado === "RECHAZADO" && !detalle) {
      setError("Escribe el motivo antes de rechazar la solicitud.");
      return;
    }
    const accion = estado === "ACEPTADO" ? "aceptar" : "rechazar";
    if (!window.confirm(`¿Confirmas ${accion} la solicitud de ${solicitud.nombreSolicitante}?`)) return;

    setOcupada(solicitud.id);
    setError("");
    setMensaje("");
    try {
      const res = await fetch("/api/kardex/solicitudes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: solicitud.id, estado, detalle: detalle || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "No se pudo registrar la decisión");
      setMensaje(`Solicitud ${estado === "ACEPTADO" ? "aceptada" : "rechazada"}.`);
      setVersion((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la decisión");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-76px)] px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">KARDEX · TITULACIÓN</p>
            <h1 className="mt-1 text-3xl font-black">Solicitudes pendientes</h1>
            <p className="mt-2 text-base font-normal text-slate-600 dark:text-slate-300">Revisa los documentos y registra una decisión para cada solicitud.</p>
          </div>
          <button onClick={() => setVersion((value) => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>

        {error && <p role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {mensaje && <p role="status" className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{mensaje}</p>}
        {cargando ? <p className="py-12 text-center text-base text-slate-500 dark:text-slate-400">Cargando solicitudes...</p> : null}
        {!cargando && !error && solicitudes.length === 0 ? <p className="py-16 text-center text-base text-slate-500 dark:text-slate-400">No hay solicitudes pendientes.</p> : null}

        <div className="mt-6 space-y-4">
          {solicitudes.map((solicitud) => (
            <article key={solicitud.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{solicitud.nombreSolicitante}</h2>
                  <p className="mt-1 text-sm font-normal text-slate-600 dark:text-slate-300">CI {solicitud.ci} · Solicitud #{solicitud.id}</p>
                  <p className="mt-1 text-sm font-normal text-slate-500 dark:text-slate-400">{new Date(solicitud.fechaSolicitud).toLocaleString("es-BO")}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">PENDIENTE</span>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold">Documentos adjuntos</h3>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {solicitud.documentos.map((documento) => {
                    const esImagen = documento.tipoMime.startsWith("image/");
                    const urlDoc = `/api/solicitudes/${solicitud.id}/documentos/${documento.id}`;

                    return (
                      <div
                        key={documento.id}
                        className="flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/60"
                      >
                        {esImagen && (
                          <div className="relative h-32 w-full bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden group">
                            <img
                              src={urlDoc}
                              alt={documento.nombreOriginal}
                              className="h-full w-full object-contain p-1 group-hover:scale-105 transition-transform"
                              loading="lazy"
                            />
                            <a
                              href={urlDoc}
                              target="_blank"
                              rel="noreferrer"
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold gap-1.5 transition-opacity"
                            >
                              Ver tamaño completo
                            </a>
                          </div>
                        )}
                        <div className="p-3 flex-1 flex flex-col justify-between">
                          <p className="text-xs font-medium truncate text-slate-800 dark:text-slate-200" title={documento.nombreOriginal}>
                            {documento.nombreOriginal}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {(documento.tamanoBytes / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <div className="mt-2.5 flex items-center gap-2">
                            <a
                              href={urlDoc}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
                            >
                              Ver
                            </a>
                            <a
                              href={urlDoc}
                              download={documento.nombreOriginal}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-teal-700 text-white hover:bg-teal-800 text-xs font-medium"
                            >
                              <ArrowDownToLine className="h-3.5 w-3.5" /> Descargar
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="mt-5 block text-sm font-semibold" htmlFor={`detalle-${solicitud.id}`}>Motivo de rechazo <span className="font-normal text-slate-500 dark:text-slate-400">(obligatorio si rechazas)</span></label>
              <textarea id={`detalle-${solicitud.id}`} value={detalles[solicitud.id] || ""} onChange={(event) => setDetalles((current) => ({ ...current, [solicitud.id]: event.target.value }))} rows={3} maxLength={4000} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-base font-normal dark:border-slate-700 dark:bg-slate-950" />

              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button disabled={ocupada === solicitud.id || !detalles[solicitud.id]?.trim()} onClick={() => void decidir(solicitud, "RECHAZADO")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-800 disabled:opacity-45 dark:border-red-900 dark:text-red-300">
                  <X className="h-4 w-4" /> Rechazar
                </button>
                <button disabled={ocupada === solicitud.id} onClick={() => void decidir(solicitud, "ACEPTADO")} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                  <Check className="h-4 w-4" /> Aceptar
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}