"use client";
import { useState, useEffect } from "react";
import {
  Users, Briefcase, GraduationCap, Clock, TrendingUp, CheckCircle2, PieChart as PieIcon, BarChart3, Layers, BookOpen, MapPin,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import GraficoSector from "@/components/GraficoSector";
import { useTemaOscuro } from "@/lib/useTemaOscuro";
import { estilosEjes, estilosTooltip } from "@/lib/graficoTema";
import { SUBTITULO_SECTOR } from "@/lib/sectores";

interface KpiSombre {
  /** Valor publicable. `null` cuando no hay muestra alguna (total 0). */
  metric_value: number | null;
  /** Registros que respaldan el indicador. */
  total_sample: number;
  /** `false` cuando no hay datos que sostener el indicador. */
  show_kpi: boolean;
}

interface Data {
  kpisTitulados: KpiSombre & { totalTitulados:number; tasaEmpleabilidadTitulados:number; tiempoPromedioEgresoTitulacion:number; tiempoPromedioInsercionTitulados:number; porcentajeEmpleoEstadistica:number; };
  kpisEgresados: KpiSombre & { totalEgresados:number; tasaEmpleabilidadEgresados:number; tiempoPromedioInsercionEgresados:number; };
  seriesPorAnio: Array<{anio:number;titulados:number;egresados:number}>;
  seriesSectorTitulados: Array<{name:string;valor:number;key:string}>;
  seriesSectorEgresados: Array<{name:string;valor:number;key:string}>;
  seriesGeoTitulados: Array<{ciudad:string;total:number}>;
  seriesGeoEgresados: Array<{ciudad:string;total:number}>;
  seriesModalidades: Array<{modalidad:string;total:number}>;
  seriesMotivosNoTitulacion: Array<{motivo:string;total:number}>;
  tablaCohortes: Array<{cohorte:string;titulados:number;egresados:number;total:number}>;
  privacidad?: { modelo: string; umbralK: null };
}

export default function PublicDashboard({ vista: vistaFija }: { vista?: "TITULADOS"|"EGRESADOS" }) {
  const [vista, setVista] = useState<"TITULADOS"|"EGRESADOS">(vistaFija ?? "TITULADOS");
  const [data, setData] = useState<Data|null>(null);
  const oscuro = useTemaOscuro();
  const tool = estilosTooltip(oscuro);
  const ejes = estilosEjes(oscuro);
  useEffect(()=>{ fetch("/api/dashboard").then(r=>r.json()).then(setData).catch(()=>{}); },[vistaFija]);
  if(!data) return <div className="text-sm text-slate-500 dark:text-slate-400 py-6">Cargando indicadores...</div>;

  /**
   * Sin umbral k, no hay celdas ocultas por tamano de grupo. Lo unico que puede
   * faltar es que no haya ninguna persona registrada todavia, y eso se explica con
   * un mensaje honesto: "aun no hay datos", no "no podemos decirlo por privacidad".
   */
  const sinDatos =
    !data.kpisTitulados.show_kpi && !data.kpisEgresados.show_kpi;

  return (
    <div className="space-y-6">
      {sinDatos && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-5 text-sm">
          <b className="block font-bold text-amber-900 dark:text-amber-200">
            Todavia no hay datos publicados
          </b>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Los indicadores se calculan sobre conteos agregados y no incluyen ningun
            dato que permita identificar a una persona. Apareceran en cuanto se
            registren graduados.
          </p>
        </div>
      )}
      {vistaFija ? null : (
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <button onClick={()=>setVista("TITULADOS")} className={`px-4 py-2 text-sm font-bold ${vista==="TITULADOS" ? "bg-blue-900 text-white":"bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"}`}>Titulados</button>
          <button onClick={()=>setVista("EGRESADOS")} className={`px-4 py-2 text-sm font-bold ${vista==="EGRESADOS" ? "bg-amber-600 text-white":"bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"}`}>Egresados</button>
        </div>
      </div>
      )}

      {vista==="TITULADOS" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-400">1. TOTAL TITULADOS</span><div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-800 rounded-xl"><GraduationCap className="w-5 h-5"/></div></div><div className="text-3xl font-black">{data.kpisTitulados.totalTitulados}</div><p className="text-[11px] text-slate-500 mt-1">Registros formales en Kardex</p><div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-900"/></div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">2. EMPLEABILIDAD</span><div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl"><TrendingUp className="w-5 h-5"/></div></div><div className="text-3xl font-black">{data.kpisTitulados.tasaEmpleabilidadTitulados.toFixed(1)}%</div><p className="text-[11px] text-slate-500 mt-1">Empleados o independientes</p><div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600"/></div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">3. EGRESO → TÍTULO</span><div className="p-2 bg-amber-50 text-amber-700 rounded-xl"><Clock className="w-5 h-5"/></div></div><div className="text-3xl font-black">{data.kpisTitulados.tiempoPromedioEgresoTitulacion.toFixed(1)}<span className="text-sm font-normal ml-1">m</span></div><p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Meses promedio para titularse</p><div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-600"/></div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-800">4. INSERCIÓN</span><div className="p-2 bg-purple-50 text-purple-700 rounded-xl"><Briefcase className="w-5 h-5"/></div></div><div className="text-3xl font-black">{data.kpisTitulados.tiempoPromedioInsercionTitulados.toFixed(1)}<span className="text-sm font-normal ml-1">m</span></div><p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Meses hasta 1er empleo</p><div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600"/></div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800">5. ÁREA ESTADÍSTICA</span><div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl"><CheckCircle2 className="w-5 h-5"/></div></div><div className="text-3xl font-black">{data.kpisTitulados.porcentajeEmpleoEstadistica.toFixed(1)}%</div><p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Empleados en área afín</p><div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600"/></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border rounded-2xl p-6 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-3"><span className="text-xs font-extrabold uppercase tracking-wider text-amber-900">1. TOTAL EGRESADOS REGISTRADOS</span><div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl"><BookOpen className="w-5 h-5"/></div></div><div className="text-4xl font-black">{data.kpisEgresados.totalEgresados}</div><p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Plan de estudios concluido</p><div className="absolute bottom-0 left-0 right-0 h-1.5 bg-amber-600"/></div>
          <div className="bg-white dark:bg-slate-900 border rounded-2xl p-6 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-3"><span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">2. TASA DE EMPLEABILIDAD (EGRESADOS)</span><div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl"><TrendingUp className="w-5 h-5"/></div></div><div className="text-4xl font-black">{data.kpisEgresados.tasaEmpleabilidadEgresados.toFixed(1)}%</div><p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Egresados con empleo en cualquier área</p><div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-600"/></div>
          <div className="bg-white dark:bg-slate-900 border rounded-2xl p-6 relative overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"><div className="flex items-center justify-between mb-3"><span className="text-xs font-extrabold uppercase tracking-wider text-purple-800">3. TIEMPO PROMEDIO DE INSERCIÓN</span><div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl"><Briefcase className="w-5 h-5"/></div></div><div className="text-4xl font-black">{data.kpisEgresados.tiempoPromedioInsercionEgresados.toFixed(1)}<span className="text-base font-normal ml-1">meses</span></div><p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Meses transcurridos hasta conseguir empleo</p><div className="absolute bottom-0 left-0 right-0 h-1.5 bg-purple-600"/></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
          <h2 className="text-base font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-800"/>{vista==="TITULADOS" ? "Titulados por Gestión / Año":"Egresados por Gestión"}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Distribución cronológica de graduados</p>
          <div className="h-64 mt-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.seriesPorAnio} margin={{top:10,right:10,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={ejes.rejilla} strokeOpacity={0.2}/><XAxis dataKey="anio" stroke={ejes.eje} tick={{fill:ejes.textoEje, fontSize:12}}/><YAxis stroke={ejes.eje} tick={{fill:ejes.textoEje, fontSize:12}} allowDecimals={false}/><Tooltip {...estilosTooltip(oscuro, 15)}/><Legend/>{vista==="TITULADOS" ? <Bar dataKey="titulados" name="Titulados" fill="#1e3a8a" radius={[4,4,0,0]}/>:<Bar dataKey="egresados" name="Egresados" fill="#d97706" radius={[4,4,0,0]}/>}</BarChart></ResponsiveContainer></div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
          <h2 className="text-base font-bold flex items-center gap-2"><PieIcon className="w-5 h-5 text-emerald-700 dark:text-emerald-400"/>Distribución por Sector Laboral ({vista})</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{SUBTITULO_SECTOR}</p>
          <GraficoSector
            series={vista==="TITULADOS" ? data.seriesSectorTitulados : data.seriesSectorEgresados}
            etiqueta={vista==="TITULADOS" ? "Titulados" : "Egresados"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
          <h2 className="text-base font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-red-700"/>Distribución Geográfica ({vista})</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Ubicación laboral (ciudad, departamento o exterior)</p>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {(vista==="TITULADOS"?data.seriesGeoTitulados:data.seriesGeoEgresados).map((g,i)=>{
              const total = vista==="TITULADOS"?data.kpisTitulados.totalTitulados:data.kpisEgresados.totalEgresados ||1;
              const pct=((g.total/total)*100).toFixed(1);
              return <div key={i} className="flex items-center justify-between text-xs sm:text-sm"><div className="flex items-center gap-2 font-medium"><span className="w-2 h-2 rounded-full bg-blue-700"/> {g.ciudad}</div><div className="flex items-center gap-3"><div className="w-24 sm:w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden hidden sm:block"><div className="bg-blue-800 h-full rounded-full" style={{width:`${pct}%`}}/></div><span className="font-bold w-14 text-right">{g.total} ({pct}%)</span></div></div>;
            })}
          </div>
        </div>
        {vista === "TITULADOS" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-800" />
              Modalidades de Titulación
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Tesis, Proyecto de Grado, Examen de Grado, Trabajo Dirigido
            </p>
            <div className="space-y-2.5">
              {data.seriesModalidades.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border"
                >
                  <span className="text-xs font-semibold">{m.modalidad}</span>
                  <span className="text-xs font-extrabold px-2.5 py-1 bg-white dark:bg-slate-900 border rounded-lg text-blue-900">
                    {m.total} titulados
                  </span>
                </div>
              ))}
            </div>
          </div>
        )} 
      </div>

    </div>
  );
}
