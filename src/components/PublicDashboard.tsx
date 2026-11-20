"use client";
import { useState, useEffect } from "react";
import {
  Briefcase,
  GraduationCap,
  Clock,
  TrendingUp,
  CheckCircle2,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  BookOpen,
  MapPin,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import GraficoSector from "@/components/GraficoSector";
import { useTemaOscuro } from "@/lib/useTemaOscuro";
import { estilosEjes, estilosTooltip } from "@/lib/graficoTema";
import { SUBTITULO_SECTOR } from "@/lib/sectores";

interface KpiSombre {
  metric_value: number | null;
  total_sample: number;
  show_kpi: boolean;
}

interface Data {
  kpisTitulados: KpiSombre & {
    totalTitulados: number;
    tasaEmpleabilidadTitulados: number;
    tiempoPromedioEgresoTitulacion: number;
    tiempoPromedioInsercionTitulados: number;
    porcentajeEmpleoEstadistica: number;
  };
  kpisEgresados: KpiSombre & {
    totalEgresados: number;
    tasaEmpleabilidadEgresados: number;
    tiempoPromedioInsercionEgresados: number;
  };
  seriesPorAnio: Array<{ anio: number; titulados: number; egresados: number }>;
  seriesSectorTitulados: Array<{ name: string; valor: number; key: string }>;
  seriesSectorEgresados: Array<{ name: string; valor: number; key: string }>;
  seriesGeoTitulados: Array<{ ciudad: string; total: number }>;
  seriesGeoEgresados: Array<{ ciudad: string; total: number }>;
  seriesModalidades: Array<{ modalidad: string; total: number }>;
  seriesMotivosNoTitulacion: Array<{ motivo: string; total: number }>;
  tablaCohortes: Array<{ cohorte: string; titulados: number; egresados: number; total: number }>;
  privacidad?: { modelo: string; umbralK: null };
}

const ETIQUETAS_MOTIVO: Record<string, string> = {
  LABORAL: "Motivos laborales",
  ECONOMICO: "Motivos económicos",
  PERSONAL: "Motivos personales",
  EN_PROCESO: "Trámite en proceso",
  OTRO: "Otros motivos",
};

export default function PublicDashboard({ vista: vistaFija }: { vista?: "TITULADOS" | "EGRESADOS" }) {
  const [vista, setVista] = useState<"TITULADOS" | "EGRESADOS">(vistaFija ?? "TITULADOS");
  const [data, setData] = useState<Data | null>(null);
  const oscuro = useTemaOscuro();
  const ejes = estilosEjes(oscuro);

  useEffect(() => {
    if (vistaFija) setVista(vistaFija);
  }, [vistaFija]);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="space-y-6 min-h-[420px]" aria-busy="true">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          <div className="h-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        </div>
      </div>
    );
  }

  const sinDatos = !data.kpisTitulados.show_kpi && !data.kpisEgresados.show_kpi;

  return (
    <div className="space-y-6">
      {sinDatos && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-5 text-sm">
          <b className="block font-bold text-amber-900 dark:text-amber-200">
            Todavía no hay datos publicados
          </b>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Los indicadores se calculan sobre conteos agregados y no incluyen ningún
            dato que permita identificar a una persona. Aparecerán en cuanto se
            registren graduados.
          </p>
        </div>
      )}

      {vistaFija ? null : (
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setVista("TITULADOS")}
              className={`px-4 py-2 text-sm font-bold transition ${
                vista === "TITULADOS"
                  ? "bg-blue-900 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Titulados
            </button>
            <button
              onClick={() => setVista("EGRESADOS")}
              className={`px-4 py-2 text-sm font-bold transition ${
                vista === "EGRESADOS"
                  ? "bg-amber-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Egresados
            </button>
          </div>
        </div>
      )}

      {vista === "TITULADOS" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-400">
                1. TOTAL TITULADOS
              </span>
              <div className="p-2 shrink-0 bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 rounded-xl">
                <GraduationCap className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {data.kpisTitulados.totalTitulados}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Registros formales en Kardex
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-900 dark:bg-blue-500" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                2. EMPLEABILIDAD
              </span>
              <div className="p-2 shrink-0 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {data.kpisTitulados.tasaEmpleabilidadTitulados.toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Empleados o independientes
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                3. EGRESO → TÍTULO
              </span>
              <div className="p-2 shrink-0 bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {data.kpisTitulados.tiempoPromedioEgresoTitulacion.toFixed(1)}
              <span className="text-sm font-normal ml-1">m</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Meses promedio para titularse
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-600" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-400">
                4. INSERCIÓN
              </span>
              <div className="p-2 shrink-0 bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 rounded-xl">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {data.kpisTitulados.tiempoPromedioInsercionTitulados.toFixed(1)}
              <span className="text-sm font-normal ml-1">m</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Meses hasta 1er empleo
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-400">
                5. ÁREA ESTADÍSTICA
              </span>
              <div className="p-2 shrink-0 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {data.kpisTitulados.porcentajeEmpleoEstadistica.toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Empleados en área afín
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-400">
                1. TOTAL EGRESADOS REGISTRADOS
              </span>
              <div className="p-2.5 shrink-0 bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 rounded-xl">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white">
              {data.kpisEgresados.totalEgresados}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Plan de estudios concluido
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-amber-600" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                2. TASA DE EMPLEABILIDAD (EGRESADOS)
              </span>
              <div className="p-2.5 shrink-0 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white">
              {data.kpisEgresados.tasaEmpleabilidadEgresados.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Egresados con empleo en cualquier área
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-600" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-400">
                3. TIEMPO PROMEDIO DE INSERCIÓN
              </span>
              <div className="p-2.5 shrink-0 bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 rounded-xl">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white">
              {data.kpisEgresados.tiempoPromedioInsercionEgresados.toFixed(1)}
              <span className="text-base font-normal ml-1">meses</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Meses transcurridos hasta conseguir empleo
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-purple-600" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
          <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <BarChart3 className="w-5 h-5 text-blue-800 dark:text-blue-400 shrink-0" />
            {vista === "TITULADOS" ? "Titulados por Gestión / Año" : "Egresados por Gestión"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Distribución cronológica de graduados
          </p>
          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.seriesPorAnio} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ejes.rejilla} strokeOpacity={oscuro ? 0.35 : 0.25} />
                <XAxis dataKey="anio" stroke={ejes.eje} tick={{ fill: ejes.textoEje, fontSize: 12 }} />
                <YAxis stroke={ejes.eje} tick={{ fill: ejes.textoEje, fontSize: 12 }} allowDecimals={false} />
                <Tooltip {...estilosTooltip(oscuro, 15)} />
                <Legend wrapperStyle={{ color: ejes.textoEje }} />
                {vista === "TITULADOS" ? (
                  <Bar
                    dataKey="titulados"
                    name="Titulados"
                    fill={oscuro ? "#3b82f6" : "#1e3a8a"}
                    radius={[4, 4, 0, 0]}
                  />
                ) : (
                  <Bar
                    dataKey="egresados"
                    name="Egresados"
                    fill={oscuro ? "#f59e0b" : "#d97706"}
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
          <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <PieIcon className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            Distribución por Sector Laboral ({vista})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{SUBTITULO_SECTOR}</p>
          <GraficoSector
            series={vista === "TITULADOS" ? data.seriesSectorTitulados : data.seriesSectorEgresados}
            etiqueta={vista === "TITULADOS" ? "Titulados" : "Egresados"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
          <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <MapPin className="w-5 h-5 text-red-700 dark:text-rose-400 shrink-0" />
            Distribución Geográfica ({vista})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Ubicación laboral (ciudad, departamento o exterior)
          </p>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {(vista === "TITULADOS" ? data.seriesGeoTitulados : data.seriesGeoEgresados).map((g, i) => {
              const total =
                (vista === "TITULADOS"
                  ? data.kpisTitulados.totalTitulados
                  : data.kpisEgresados.totalEgresados) || 1;
              const pct = ((g.total / total) * 100).toFixed(1);
              return (
                <div key={i} className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 font-medium min-w-0">
                    <span className="w-2 h-2 shrink-0 rounded-full bg-blue-700 dark:bg-blue-400" />
                    <span className="truncate">{g.ciudad}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 sm:w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden hidden sm:block">
                      <div
                        className="bg-blue-800 dark:bg-blue-500 h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-bold whitespace-nowrap tabular-nums text-right min-w-[5.25rem]">
                      {g.total} ({pct}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {vista === "TITULADOS" ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Layers className="w-5 h-5 text-indigo-800 dark:text-indigo-400 shrink-0" />
              Modalidades de Titulación
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Tesis, Proyecto de Grado, Examen de Grado, Trabajo Dirigido
            </p>
            <div className="space-y-2.5">
              {data.seriesModalidades.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                >
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {m.modalidad}
                  </span>
                  <span className="text-xs font-extrabold px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-blue-900 dark:text-blue-300 whitespace-nowrap shrink-0">
                    {m.total} {m.total === 1 ? "titulado" : "titulados"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
              Situación y Motivos de No Titulación
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Causas reportadas por los egresados pendientes de titulación
            </p>
            {data.seriesMotivosNoTitulacion.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sin motivos registrados aún.
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.seriesMotivosNoTitulacion.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {ETIQUETAS_MOTIVO[m.motivo] ?? m.motivo}
                    </span>
                    <span className="text-xs font-extrabold px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-amber-800 dark:text-amber-300 whitespace-nowrap shrink-0">
                      {m.total} {m.total === 1 ? "egresado" : "egresados"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
