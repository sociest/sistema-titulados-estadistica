"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Briefcase,
  GraduationCap,
  Clock,
  TrendingUp,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  MapPin,
  CheckCircle2,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  BookOpen,
  Info,
  ArrowRight,
  Newspaper,
  UserCog,
  ScrollText,
  Upload,
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
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExportModal from "@/components/ExportModal";
import GraficoSector from "@/components/GraficoSector";
import { useTemaOscuro } from "@/lib/useTemaOscuro";
import { estilosTooltip } from "@/lib/graficoTema";
import { SUBTITULO_SECTOR } from "@/lib/sectores";

interface DashboardData {
  kpisTitulados: {
    totalTitulados: number;
    tasaEmpleabilidadTitulados: number;
    tiempoPromedioEgresoTitulacion: number;
    tiempoPromedioInsercionTitulados: number;
    porcentajeEmpleoEstadistica: number;
  };
  kpisEgresados: {
    totalEgresados: number;
    tasaEmpleabilidadEgresados: number;
    tiempoPromedioInsercionEgresados: number;
  };
  seriesPorAnio: Array<{ anio: number; titulados: number; egresados: number }>;
  seriesSectorTitulados: Array<{ name: string; valor: number; key: string }>;
  seriesSectorEgresados: Array<{ name: string; valor: number; key: string }>;
  seriesGeoTitulados: Array<{ ciudad: string; total: number }>;
  seriesGeoEgresados: Array<{ ciudad: string; total: number }>;
  tablaCohortes: Array<{ cohorte: string; titulados: number; egresados: number; total: number }>;
  seriesModalidades: Array<{ modalidad: string; total: number }>;
  seriesMotivosNoTitulacion: Array<{ motivo: string; total: number }>;
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  // El bloqueo real de /admin/** lo hace src/middleware.ts en el servidor.
  // Acá solo se evita el parpadeo mientras se resuelve la sesión.
  const [vista, setVista] = useState<"TITULADOS" | "EGRESADOS">("TITULADOS");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);

  // Filtros
  const [sector, setSector] = useState<string>("TODOS");
  const [modalidad, setModalidad] = useState<string>("TODAS");
  const oscuro = useTemaOscuro();
  const [anioMin, setAnioMin] = useState<string>("");
  const [anioMax, setAnioMax] = useState<string>("");

  // Modal de exportación
  const [exportModal, setExportModal] = useState<{
    open: boolean;
    formato: "excel" | "csv";
    params: URLSearchParams;
  }>({ open: false, formato: "excel", params: new URLSearchParams() });
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // scope=admin: el endpoint rechaza con 403 si la petición no viene de un admin.
      // Antes el dashboard con filtros respondía a cualquiera.
      params.append("scope", "admin");
      if (sector !== "TODOS") params.append("sector", sector);
      if (modalidad !== "TODAS") params.append("modalidad", modalidad);
      if (anioMin) params.append("anioMin", anioMin);
      if (anioMax) params.append("anioMax", anioMax);

      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        // La sesión expiró o dejó de ser admin: el servidor es la autoridad.
        setError("Su sesión expiró. Vuelva a iniciar sesión.");
        setData(null);
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Error al cargar datos:", err);
      setError("No se pudieron cargar los indicadores.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sector, modalidad, anioMin, anioMax]);

  const handleExport = (formato: "excel" | "csv") => {
    const params = new URLSearchParams();
    params.append("tipo", vista === "TITULADOS" ? "TITULADOS" : "EGRESADOS");
    if (sector !== "TODOS") params.append("sector", sector);
    if (modalidad !== "TODAS") params.append("modalidad", modalidad);
    if (anioMin) params.append("anioMin", anioMin);
    if (anioMax) params.append("anioMax", anioMax);

    // `formato` NO viaja en los params: lo elige el endpoint que firma el enlace, para
    // que el cliente no pueda obtener una firma y usarla con otro formato distinto.
    setExportError(null);
    setExportModal({ open: true, formato, params });
  };

  /**
   * Pide al servidor una URL de descarga TEMPORAL y la abre.
   *
   * Antes se abría `/api/exportar?params` directamente. Eso ya no funciona, y no por
   * un capricho del servidor: una URL de descarga protegida solo con cookie se queda en
   * el historial del navegador y en el log del proxy, y quien la lea después descarga la
   * base de datos completa sin tener sesión. El enlace firmado caduca en 5 minutos y
   * está atado a este usuario (ISO/IEC 27001:2022, A.8.12).
   */
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
      window.open(data.url, "_blank");
      setExportModal((m) => ({ ...m, open: false }));
    } catch {
      setExportError("Error de red al generar el enlace de descarga.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Nota: los botones "PDF" y "PDF + detalle" se eliminaron a pedido del usuario
  // (bugs.md §3 caso 2). El endpoint /api/exportar/pdf sigue existiendo en el
  // servidor por si más adelante se decide rehabilitarlo; lo que ya no hay es la
  // forma de dispararlo desde la interfaz. El informe oficial se obtiene con
  // "Imprimir Informe", que ahora sale con carátula y solo con las métricas.

  if (authLoading) {
    return <div className="max-w-3xl mx-auto p-8 text-sm text-slate-500 dark:text-slate-400">Verificando sesión…</div>;
  }

  if (!user || user.rol !== "admin") {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-6 text-sm">
          <b>Acceso restringido:</b> el dashboard completo es exclusivo de administrador.
          <br />
          <a href="/login" className="text-blue-800 dark:text-blue-400 font-bold underline">
            Ir a iniciar sesión
          </a>
          <span className="mx-2">·</span>
          <a href="/" className="underline">Volver al inicio informativo</a>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {error && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {error}
        </div>
      )}

      {/* Header Institucional de Acreditación (Oficial de Titulados) */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-400 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-700 dark:bg-blue-500"></span>
            Carrera de Estadística · UMSA
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Sistema de Seguimiento a Titulados
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Módulo de Indicadores y Visualización para la Evaluación Externa de Acreditación
          </p>
        </div>

        {/* Acciones de exportación y módulos */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/personas"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Registrar y editar titulados y egresados"
          >
            <Users className="w-4 h-4" />
            Registrar personas
          </Link>
          <Link
            href="/admin/importar"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Importación masiva desde Excel o CSV"
          >
            <Upload className="w-4 h-4" />
            Importar
          </Link>
          <Link
            href="/admin/noticias"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Gestionar noticias y convocatorias"
          >
            <Newspaper className="w-4 h-4" />
            Noticias
          </Link>
          <Link
            href="/admin/usuarios"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Gestionar usuarios administradores"
          >
            <UserCog className="w-4 h-4" />
            Usuarios
          </Link>
          <Link
            href="/admin/auditoria"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Ver quién hizo qué cambios y cuándo"
          >
            <ScrollText className="w-4 h-4" />
            Auditoría
          </Link>
          <button
            onClick={() => handleExport("excel")}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Generar Excel en memoria RAM"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel ({vista === "TITULADOS" ? "Titulados" : "Egresados"})
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Generar CSV en memoria RAM"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            title="Imprimir informe oficial"
          >
            <FileText className="w-4 h-4" />
            Imprimir Informe
          </button>
        </div>
      </div>

      {/* Barra de Introducción Sigilosa / Switch Suave de Egresados */}
      <div className="no-print bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300">
            {vista === "TITULADOS" ? (
              <GraduationCap className="w-5 h-5" />
            ) : (
              <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {vista === "TITULADOS"
                  ? "Visualizando: Registro Oficial de Titulados"
                  : "Visualizando: Información Complementaria de Egresados"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {vista === "TITULADOS"
                ? "Indicadores de profesionales que obtuvieron título formal de la carrera."
                : "Estudiantes que concluyeron el plan de estudios y están en proceso o pendientes de titulación."}
            </p>
          </div>
        </div>

        {/* Botón Suave para Alternar Perspectiva */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          {vista === "TITULADOS" ? (
            <button
              onClick={() => setVista("EGRESADOS")}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <span>Ver info complementaria de Egresados</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          ) : (
            <button
              onClick={() => setVista("TITULADOS")}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-900 text-white hover:bg-blue-800 flex items-center gap-1.5 transition-all shadow-sm"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Volver a Titulados (Oficial)</span>
            </button>
          )}
        </div>
      </div>

      {/* Carátula institucional: solo aparece en el informe impreso.
          Replica la del PDF (reportePdf.ts) para que el papel tenga la misma
          identificación institucional. */}
      <div className="solo-impresion mb-6 text-center">
        <div className="h-[3px] w-24 mx-auto bg-[#0f2d52] mb-4" />
        <h1 className="text-lg font-black tracking-[0.15em] text-[#0f2d52]">
          UNIVERSIDAD MAYOR DE SAN ANDRÉS
        </h1>
        <h2 className="text-base font-black tracking-[0.12em] text-[#0f2d52] mt-1">
          CARRERA DE ESTADÍSTICA
        </h2>
        <p className="text-sm text-black dark:text-slate-100 mt-1">
          Sistema de Seguimiento a Titulados y Egresados
        </p>
        <p className="text-xs text-black dark:text-slate-100 mt-1">
          Vista: {vista} · Generado:{" "}
          {new Date().toLocaleString("es-BO", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <div className="h-[1px] w-full bg-black/30 mt-4" />
      </div>

      {/* Título que sí se imprime: va justo encima de los filtros de análisis */}
      <div className="mb-3">
        <h2 className="text-base font-black tracking-tight text-black dark:text-slate-100">
          Métricas de {vista === "TITULADOS" ? "titulados" : "egresados"}
        </h2>
      </div>

      {/* Barra de Filtros Global */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-3 transition-colors">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Filter className="w-4 h-4 text-blue-900 dark:text-blue-400" />
          <span>Filtros de Análisis:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 hover:border-slate-400 dark:hover:border-slate-500 transition"
          >
            <option value="TODOS">Todos los sectores laborales</option>
            <option value="PUBLICO">Público</option>
            <option value="PRIVADO">Privado</option>
            <option value="ACADEMICO">Académico / Investigación</option>
            <option value="ONG">ONG / Fundaciones</option>
            <option value="OTRO">Otro</option>
          </select>

          {vista === "TITULADOS" && (
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 hover:border-slate-400 dark:hover:border-slate-500 transition"
            >
              <option value="TODAS">Todas las modalidades</option>
              <option value="Tesis">Tesis</option>
              <option value="Proyecto de grado">Proyecto de grado</option>
              <option value="Examen de grado">Examen de grado</option>
              <option value="Trabajo dirigido">Trabajo dirigido</option>
              <option value="Otro">Otro</option>
            </select>
          )}

          <input
            type="number"
            placeholder="Año Min"
            value={anioMin}
            onChange={(e) => setAnioMin(e.target.value)}
            className="w-20 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <input
            type="number"
            placeholder="Año Max"
            value={anioMax}
            onChange={(e) => setAnioMax(e.target.value)}
            className="w-20 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <button
            onClick={fetchData}
            className="no-print p-1.5 text-slate-500 hover:text-blue-900 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Lectura de los filtros en papel: los <select> e <input> no se
              imprimen de forma útil, así que se imprime su valor como texto. */}
          <div className="w-full text-[11px] text-black dark:text-slate-100 leading-relaxed">
            <b>Filtros aplicados:</b> Sector&nbsp;=
            {sector === "TODOS"
              ? "Todos los sectores laborales"
              : sector === "PUBLICO"
                ? "Público"
                : sector === "PRIVADO"
                  ? "Privado"
                  : sector === "ACADEMICO"
                    ? "Académico / Investigación"
                    : sector === "ONG"
                      ? "ONG / Fundaciones"
                      : "Otro"}
            {vista === "TITULADOS" && (
              <>
                {" · "}Modalidad&nbsp;= {modalidad}
              </>
            )}
            {" · "}Años&nbsp;= {anioMin || "sin mínimo"} — {anioMax || "sin máximo"}
          </div>
        </div>
      </div>

      {/* SECCIÓN KPIS */}
      {vista === "TITULADOS" ? (
        /* 5 KPIS PRINCIPALES DE TITULADOS */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* KPI 1: Total Titulados */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-400">
                1. Total Titulados
              </span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-400 rounded-xl">
                <GraduationCap className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {data?.kpisTitulados.totalTitulados ?? 0}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Registros formales en Kardex</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-900 dark:bg-blue-600"></div>
          </div>

          {/* KPI 2: Tasa de Empleabilidad Titulados */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                2. Empleabilidad
              </span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {(data?.kpisTitulados.tasaEmpleabilidadTitulados ?? 0).toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Empleados o independientes</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 dark:bg-emerald-500"></div>
          </div>

          {/* KPI 3: Tiempo Promedio Egreso -> Titulación */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                3. Egreso → Título
              </span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {(data?.kpisTitulados.tiempoPromedioEgresoTitulacion ?? 0).toFixed(1)}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">m</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Meses promedio para titularse</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-600 dark:bg-amber-500"></div>
          </div>

          {/* KPI 4: Inserción Laboral */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-400">
                4. Inserción
              </span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400 rounded-xl">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {(data?.kpisTitulados.tiempoPromedioInsercionTitulados ?? 0).toFixed(1)}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">m</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Meses hasta 1er empleo</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 dark:bg-purple-500"></div>
          </div>

          {/* KPI 5: Titulados con Empleo en Estadística */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-400">
                5. Área Estadística
              </span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {(data?.kpisTitulados.porcentajeEmpleoEstadistica ?? 0).toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Empleados en área afín</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 dark:bg-indigo-500"></div>
          </div>
        </div>
      ) : (
        /* 3 KPIS COMPLEMENTARIOS DE EGRESADOS */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-400">
                1. Total Egresados Registrados
              </span>
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-xl">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white">
              {data?.kpisEgresados.totalEgresados ?? 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Plan de estudios concluido</p>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-amber-600"></div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                2. Tasa de Empleabilidad (Egresados)
              </span>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white">
              {(data?.kpisEgresados.tasaEmpleabilidadEgresados ?? 0).toFixed(1)}%
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Egresados con empleo en cualquier área</p>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-600"></div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm relative overflow-hidden transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-400">
                3. Tiempo Promedio de Inserción
              </span>
              <div className="p-2.5 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400 rounded-xl">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white">
              {(data?.kpisEgresados.tiempoPromedioInsercionEgresados ?? 0).toFixed(1)}
              <span className="text-base font-normal text-slate-500 dark:text-slate-400 ml-1">meses</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Meses transcurridos hasta conseguir empleo</p>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-purple-600"></div>
          </div>
        </div>
      )}

      {/* GRÁFICOS RECHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Evolución por Año */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-800 dark:text-blue-400" />
              {vista === "TITULADOS" ? "Titulados por Gestión / Año" : "Egresados por Gestión"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribución cronológica de graduados
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data?.seriesPorAnio || []}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="anio" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip {...estilosTooltip(oscuro)} />
                <Legend />
                {vista === "TITULADOS" ? (
                  <Bar dataKey="titulados" name="Titulados" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                ) : (
                  <Bar dataKey="egresados" name="Egresados" fill="#d97706" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Distribución por Sector Laboral */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              Distribución por Sector Laboral ({vista === "TITULADOS" ? "Titulados" : "Egresados"})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {SUBTITULO_SECTOR}
            </p>
          </div>
          <GraficoSector
            series={
              vista === "TITULADOS"
                ? data?.seriesSectorTitulados || []
                : data?.seriesSectorEgresados || []
            }
            etiqueta={vista === "TITULADOS" ? "Titulados" : "Egresados"}
          />
        </div>
      </div>

      {/* SECCIÓN DISTRIBUCIÓN GEOGRÁFICA Y MODALIDAD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución Geográfica */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
          {/* El título va como grupo de encabezado: al partirse la lista entre hojas, el
              motor de impresión lo vuelve a dibujar arriba. */}
          <div className="tabla-impresion">
            <div className="tabla-impresion-titulo">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                <MapPin className="w-5 h-5 text-red-700 dark:text-red-400" />
                Distribución Geográfica ({vista === "TITULADOS" ? "Titulados" : "Egresados"})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Ubicación laboral (ciudad, departamento o exterior)
              </p>
            </div>

            <div className="tabla-impresion-cuerpo">
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {(vista === "TITULADOS"
                  ? data?.seriesGeoTitulados || []
                  : data?.seriesGeoEgresados || []
                ).map((geo, index) => {
                  const totalItems =
                    (vista === "TITULADOS"
                      ? data?.kpisTitulados.totalTitulados
                      : data?.kpisEgresados.totalEgresados) || 1;
                  const porcentaje = ((geo.total / totalItems) * 100).toFixed(1);

                  return (
                    <div key={index} className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-blue-700 dark:bg-blue-400"></span>
                        {geo.ciudad}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 sm:w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden hidden sm:block">
                          <div
                            className="bg-blue-800 dark:bg-blue-500 h-full rounded-full"
                            style={{ width: `${porcentaje}%` }}
                          ></div>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white w-14 text-right">
                          {geo.total} ({porcentaje}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Modalidades / Motivos */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
          {/* El título se declara como grupo de encabezado dentro de una tabla de impresión:
              si la lista salta de hoja, el motor vuelve a dibujar el título arriba. */}
          <div className="tabla-impresion">
            {vista === "TITULADOS" ? (
              <>
                <div className="tabla-impresion-titulo">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                    <Layers className="w-5 h-5 text-indigo-800 dark:text-indigo-400" />
                    Modalidades de Titulación
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Tesis, Proyecto de Grado, Examen de Grado, Trabajo Dirigido
                  </p>
                </div>
                <div className="tabla-impresion-cuerpo space-y-2.5">
                  {data?.seriesModalidades.map((mod, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                    >
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {mod.modalidad}
                      </span>
                      <span className="text-xs font-extrabold px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-blue-900 dark:text-blue-400 shadow-2xs">
                        {mod.total} titulados
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="tabla-impresion-titulo">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                    <Clock className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                    Motivos de No Titulación (Egresados)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Factores laborales, económicos, personales o en proceso
                  </p>
                </div>
                <div className="tabla-impresion-cuerpo space-y-2.5">
                  {data?.seriesMotivosNoTitulacion.map((mot, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40"
                    >
                      <span className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-200">
                        {mot.motivo}
                      </span>
                      <span className="text-xs font-extrabold px-2.5 py-1 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-900 dark:text-amber-400 shadow-2xs">
                        {mot.total} egresados
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* TABLA COMPARATIVA DE COHORTES */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm overflow-hidden transition-colors">
        {/* Con el título como grupo de encabezado, al continuar la tabla en otra hoja se
            repite tanto el encabezado de columnas (lo hace el <thead>) como el nombre de la
            tabla, que antes se quedaba solo en la primera. */}
        <div className="tabla-impresion">
          <div className="tabla-impresion-titulo">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-900 dark:text-blue-400" />
                Tabla Comparativa de Cohortes (Titulados vs. Egresados)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Relación por cohorte de ingreso (Kardex) y porcentaje de titulación
              </p>
            </div>
          </div>

          <div className="tabla-impresion-cuerpo overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Cohorte de Ingreso</th>
                <th className="py-3 px-4 text-center">Titulados (Oficial)</th>
                <th className="py-3 px-4 text-center">Egresados (Compl.)</th>
                <th className="py-3 px-4 text-center">Total Cohorte</th>
                <th className="py-3 px-4 text-right">% Eficiencia Titulación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.tablaCohortes.map((row, idx) => {
                const eficiencia = row.total > 0 ? (row.titulados / row.total) * 100 : 0;
                return (
                  <tr
                    key={idx}
                    className="hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                      {row.cohorte}
                    </td>
                    <td className="py-3 px-4 text-center text-blue-900 dark:text-blue-400 font-semibold">
                      {row.titulados}
                    </td>
                    <td className="py-3 px-4 text-center text-amber-800 dark:text-amber-400 font-semibold">
                      {row.egresados}
                    </td>
                    <td className="py-3 px-4 text-center font-extrabold text-slate-900 dark:text-white">
                      {row.total}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      {eficiencia.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Error al generar el enlace temporal. Se muestra fuera del modal para que el
          mensaje no desaparezca al cerrarlo, y explica qué hacer (reintentar). */}
      {exportError && (
        <div className="no-print fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-lg">
          <b className="block font-bold">No se pudo descargar</b>
          {exportError}
          <button
            onClick={() => setExportError(null)}
            className="mt-2 text-xs font-bold underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Modal de confirmación de exportación */}
      <ExportModal
        isOpen={exportModal.open}
        onClose={() => setExportModal((m) => ({ ...m, open: false }))}
        onConfirm={confirmExport}
        title={vista === "TITULADOS" ? "titulados" : "egresados"}
        formato={exportModal.formato}
        params={exportModal.params}
        // Nota de seguridad: el enlace que se genera es temporal y caduca en minutos.
        aviso="La descarga se realiza mediante un enlace seguro que caduca en 5 minutos y solo puede usarse desde esta sesión."
      />
    </div>
  );
}
