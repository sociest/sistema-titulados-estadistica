"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ScrollText, Loader2, ChevronDown, ChevronRight, Filter, X, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Registro de actividad (PDF 4.2: "quién hizo qué cambios y cuándo").
 *
 * Antes la tabla `audit_log` estaba en el esquema pero no existía en la base y no había ni
 * una línea de código que escribiera en ella. Ahora se consulta y se puede ver el detalle
 * de qué campo cambió de un valor a otro.
 */

interface Entrada {
  id: number;
  accion: "crear" | "editar" | "eliminar" | "exportar" | "importar";
  entidad: string;
  entidadId: number | null;
  detalles: string | null;
  datosAnteriores: string | null;
  datosNuevos: string | null;
  ip: string | null;
  creadoEn: string;
  usuarioNombre: string | null;
  usuarioCorreo: string | null;
}

const COLOR_ACCION: Record<string, string> = {
  crear: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  editar: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  eliminar: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  exportar: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  importar: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const inp =
  "text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600";

export default function AdminAuditoriaPage() {
  const { user, loading: authLoading } = useAuth();

  const [filas, setFilas] = useState<Entrada[] | null>(null);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [entidades, setEntidades] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [expandida, setExpandida] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [accion, setAccion] = useState("TODOS");
  const [entidad, setEntidad] = useState("TODAS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const p = new URLSearchParams();
      if (accion !== "TODOS") p.set("accion", accion);
      if (entidad !== "TODAS") p.set("entidad", entidad);
      if (desde) p.set("desde", desde);
      if (hasta) p.set("hasta", hasta);
      p.set("page", String(pagina));
      p.set("perPage", "50");

      const res = await fetch(`/api/auditoria?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      const j = await res.json();
      setFilas(j.filas); setTotal(j.total); setPaginas(j.paginas); setEntidades(j.entidades);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [accion, entidad, desde, hasta, pagina]);

  useEffect(() => { if (user?.rol === "admin") cargar(); }, [user, cargar]);

  if (authLoading) return <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Verificando sesión…</div>;
  if (!user || user.rol !== "admin") return null;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm font-bold px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-blue-800 dark:text-blue-400" />
            Registro de actividad
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quién hizo qué cambios y cuándo · {total} operaciones registradas
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
          <Filter className="w-4 h-4" /> Filtros
        </div>
        <select value={accion} onChange={(e) => { setAccion(e.target.value); setPagina(1); }} className={inp}>
          <option value="TODOS">Todas las acciones</option>
          {["crear", "editar", "eliminar", "exportar", "importar"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={entidad} onChange={(e) => { setEntidad(e.target.value); setPagina(1); }} className={inp}>
          <option value="TODAS">Todas las entidades</option>
          {entidades.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} className={inp} title="Desde" />
        <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} className={inp} title="Hasta" />
        {(desde || hasta || accion !== "TODOS" || entidad !== "TODAS") && (
          <button onClick={() => { setAccion("TODOS"); setEntidad("TODAS"); setDesde(""); setHasta(""); setPagina(1); }}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {cargando && filas === null && <div className="p-10 text-center text-sm text-slate-400">Cargando…</div>}
        {!cargando && filas?.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-400">
            Todavía no hay actividad registrada.
          </div>
        )}

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas?.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => setExpandida(expandida === f.id ? null : f.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-start gap-3"
              >
                <span className="mt-0.5 shrink-0 text-slate-400">
                  {expandida === f.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>

                <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mt-0.5 ${COLOR_ACCION[f.accion]}`}>
                  {f.accion}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 dark:text-slate-100">{f.detalles ?? `${f.accion} en ${f.entidad}`}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {f.usuarioNombre ?? "Sistema"} · {f.entidad}
                    {f.entidadId ? ` #${f.entidadId}` : ""}
                    {f.ip ? ` · ${f.ip}` : ""}
                  </span>
                </span>

                <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">
                  {new Date(f.creadoEn).toLocaleString("es-BO")}
                </span>
              </button>

              {expandida === f.id && (f.datosAnteriores || f.datosNuevos) && (
                <div className="px-8 pb-4 -mt-1">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 rounded-lg p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-400 mb-1">Antes</p>
                      <pre className="text-[10px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all max-h-52 overflow-auto font-mono">
                        {f.datosAnteriores ?? "—"}
                      </pre>
                    </div>
                    <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-lg p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">Después</p>
                      <pre className="text-[10px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all max-h-52 overflow-auto font-mono">
                        {f.datosNuevos ?? "—"}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {paginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Página {pagina} de {paginas} · {total} operaciones</span>
            <div className="flex gap-2">
              <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Anterior</button>
              <button disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
