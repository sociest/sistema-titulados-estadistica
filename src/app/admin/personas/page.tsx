"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Plus, Pencil, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, Users, GraduationCap, BookOpen, Upload, ShieldAlert, RefreshCw,
  FileSpreadsheet, Download,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import LoadingOverlay from "@/components/LoadingOverlay";
import ExportModal from "@/components/ExportModal";
import KardexNav from "@/components/KardexNav";
import { camposFaltantesPersona, MODALIDADES_OFICIALES } from "@/lib/normalizacion";

/**
 * MÓDULO 1 — REGISTRO ADMINISTRATIVO DE TITULADOS Y EGRESADOS.
 *
 * Esta pantalla NO existía. Antes el admin solo podía ver el dashboard y las noticias:
 * no había forma de registrar, editar ni dar de baja a nadie. Los datos entraban
 * únicamente por el script `seed`.
 *
 * Features:
 *  - Listado con búsqueda, filtros por tipo/sector/estado y paginación.
 *  - Alta de titulados y egresados con validación en el servidor (zod).
 *  - Edición completa, incluidos los campos "K" de Kardex (solo admin puede tocarlos).
 *  - Detección de CI duplicada antes de dejar guardar.
 *  - Baja lógica (se conserva el registro para la evidencia de acreditación).
 */

interface Persona {
  id: number;
  tipo: "TITULADO" | "EGRESADO";
  nombresApellidos: string;
  cedulaIdentidad: string;
  genero: "MASCULINO" | "FEMENINO" | "PREFIERO_NO_DECIR";
  semestreIngreso: string | null;
  semestreEgreso: string | null;
  anioEgreso: number | null;
  anioTitulacion: number | null;
  modalidadTitulacion: string | null;
  areaEspecializacion: string | null;
  planeaTitularse: string | null;
  inicioProcesoTitulacion: string | null;
  motivoNoTitulacion: string | null;
  correoElectronico: string | null;
  telefono: string | null;
  redesSociales: string | null;
  ciudadRegionTrabajo: string | null;
  imagenUrl: string | null;
  estadoLaboral: string | null;
  sectorTrabajo: string | null;
  sectorTrabajoOtro: string | null;
  ocupacionCargo: string | null;
  trabajaEnEstadistica: boolean;
  tiempoInsercionLaboralMeses: number | null;
  observaciones: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

interface RespuestaListado {
  filas: Persona[];
  total: number;
  pagina: number;
  paginas: number;
  resumen: { titulados: number; egresados: number; empleados: number; incompletos?: number };
}

type FormState = Record<string, string | boolean>;

/** Lee un campo del formulario como texto, tolerando que sea booleano. */
const txt = (f: FormState, k: string): string => {
  const v = f[k];
  if (typeof v === "boolean") return v ? "true" : "";
  return v ?? "";
};

/**
 * Marca visual de los campos de Kardex ("K").
 *
 * Según la especificación, son datos formales que carga la carrera y que el titular o
 * egresado NO puede editar. El administrador sí puede corregirlos (por ejemplo, una
 * errata de Kardex), salvo la cédula, que se congela porque es la llave única del
 * registro. La etiqueta solo informa: el bloqueo real está en el servidor.
 */
function EtiquetaKardex() {
  return (
    <span
      className="ml-1 inline-flex items-center align-middle text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded"
      title="Dato de Kardex: solo el administrador de la carrera puede editarlo"
    >
      K
    </span>
  );
}

/** Resultado del chequeo en vivo de disponibilidad de la cédula. */
type EstadoCi = { estado: "idle" | "checking" | "libre" | "ocupada"; texto: string; color: string };

const FORM_VACIO: FormState = {
  tipo: "TITULADO",
  nombresApellidos: "",
  cedulaIdentidad: "",
  genero: "",
  semestreIngreso: "",
  semestreEgreso: "",
  anioEgreso: "",
  anioTitulacion: "",
  modalidadTitulacion: "",
  areaEspecializacion: "",
  planeaTitularse: "",
  inicioProcesoTitulacion: "",
  motivoNoTitulacion: "",
  correoElectronico: "",
  telefono: "",
  redesSociales: "",
  ciudadRegionTrabajo: "",
  estadoLaboral: "DESEMPLEADO",
  sectorTrabajo: "",
  sectorTrabajoOtro: "",
  ocupacionCargo: "",
  trabajaEnEstadistica: false,
  tiempoInsercionLaboralMeses: "",
  observaciones: "",
};

const ETIQUETA_GENERO: Record<string, string> = {
  MASCULINO: "M", FEMENINO: "F", PREFIERO_NO_DECIR: "?",
};
const ETIQUETA_ESTADO: Record<string, string> = {
  EMPLEADO: "Empleado", DESEMPLEADO: "Desempleado", INDEPENDIENTE: "Independiente",
};
const ETIQUETA_SECTOR: Record<string, string> = {
  PUBLICO: "Público", PRIVADO: "Privado", ACADEMICO: "Académico",
  ONG: "ONG", OTRO: "Otro", "": "—",
};

export default function AdminPersonasPage() {
  const { user, loading: authLoading } = useAuth();

  const [datos, setDatos] = useState<RespuestaListado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Filtros
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("TODOS");
  const [sector, setSector] = useState("TODOS");
  const [estado, setEstado] = useState("TODOS");
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [perPage] = useState(25);

  // Modal y selección múltiple
  const [modal, setModal] = useState<"cerrado" | "nuevo" | "editar" | "borrar">("cerrado");
  const [editando, setEditando] = useState<Persona | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [modoBorrado, setModoBorrado] = useState<"uno" | "masivo">("uno");
  const [motivoBaja, setMotivoBaja] = useState("");
  const [confirmarPersona, setConfirmarPersona] = useState<null | { cambios: { campo: string; antes: string; nuevo: string }[] }>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [avisoAlta, setAvisoAlta] = useState<string | null>(null);
  const [campoError, setCampoError] = useState<Record<string, string[]>>({});
  const [estadoCi, setEstadoCi] = useState<EstadoCi>({ estado: "idle", texto: "", color: "" });
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
    params.append(
      "tipo",
      tipo === "TITULADO" ? "TITULADOS" : tipo === "EGRESADO" ? "EGRESADOS" : "TODOS"
    );
    if (sector !== "TODOS") params.append("sector", sector);
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

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (tipo !== "TODOS") p.set("tipo", tipo);
      if (sector !== "TODOS") p.set("sector", sector);
      if (estado !== "TODOS") p.set("estado", estado);
      if (soloIncompletos) p.set("soloIncompletos", "true");
      p.set("page", String(pagina));
      p.set("perPage", String(perPage));

      const res = await fetch(`/api/personas?${p.toString()}`);
      if (res.status === 401) { setError("Su sesión expiró. Vuelva a iniciar sesión."); setDatos(null); return; }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al cargar");
      setDatos(j);
      setSeleccionados([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [q, tipo, sector, estado, soloIncompletos, pagina, perPage]);

  // Búsqueda con rebote para no pegarle a la base en cada tecla.
  useEffect(() => {
    const t = setTimeout(cargar, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  const set = (k: string, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setCampoError((e) => {
      if (!e[k]) return e;
      const { [k]: _quitar, ...resto } = e;
      return resto;
    });
  };

  // ── Acciones de modal ──────────────────────────────────────────────────────
  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setEditando(null);
    setCampoError({});
    setMsg(null);
    setEstadoCi({ estado: "idle", texto: "", color: "" });
    setModal("nuevo");
  };

  /**
   * Chequeo en vivo de disponibilidad de la cédula.
   *
   * El servidor igual rechaza los duplicados con 409 (es la garantía real: esta
   * comprobación es solo ayuda visual y no evita una condición de carrera entre dos
   * altas simultáneas).
   */
  const comprobarCi = useCallback(async (valor: string) => {
    const ci = valor.trim().toUpperCase();
    if (ci.length < 4) {
      setEstadoCi({ estado: "idle", texto: "", color: "" });
      return;
    }
    setEstadoCi({ estado: "checking", texto: "Comprobando…", color: "text-slate-400" });
    try {
      const res = await fetch(`/api/personas?ci=${encodeURIComponent(ci)}`);
      if (res.status === 200) {
        const j = await res.json();
        setEstadoCi({
          estado: "ocupada",
          texto: `✗ Ya registrada a nombre de ${j.nombresApellidos ?? "otra persona"}`,
          color: "text-red-600 dark:text-red-400",
        });
      } else {
        setEstadoCi({
          estado: "libre",
          texto: "✓ Cédula disponible",
          color: "text-emerald-600 dark:text-emerald-400",
        });
      }
    } catch {
      setEstadoCi({ estado: "idle", texto: "", color: "" });
    }
  }, []);

  // Al escribir la CI, se comprueba con rebote (no en cada tecla).
  useEffect(() => {
    if (modal !== "nuevo") return;
    const t = setTimeout(() => comprobarCi(txt(form, "cedulaIdentidad")), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cedulaIdentidad, modal, comprobarCi]);

  const abrirEditar = (p: Persona) => {
    setForm({
      tipo: p.tipo,
      nombresApellidos: p.nombresApellidos,
      cedulaIdentidad: p.cedulaIdentidad,
      genero: p.genero === "PREFIERO_NO_DECIR" ? "" : p.genero,
      semestreIngreso: p.semestreIngreso ?? "",
      semestreEgreso: p.semestreEgreso ?? "",
      anioEgreso: p.anioEgreso != null ? String(p.anioEgreso) : "",
      anioTitulacion: p.anioTitulacion != null ? String(p.anioTitulacion) : "",
      modalidadTitulacion: p.modalidadTitulacion ?? "",
      areaEspecializacion: p.areaEspecializacion ?? "",
      planeaTitularse: p.planeaTitularse ?? "",
      inicioProcesoTitulacion: p.inicioProcesoTitulacion ?? "",
      motivoNoTitulacion: p.motivoNoTitulacion ?? "",
      correoElectronico: p.correoElectronico ?? "",
      telefono: p.telefono ?? "",
      redesSociales: p.redesSociales ?? "",
      ciudadRegionTrabajo: p.ciudadRegionTrabajo ?? "",
      estadoLaboral: p.estadoLaboral ?? "DESEMPLEADO",
      sectorTrabajo: p.sectorTrabajo ?? "",
      sectorTrabajoOtro: p.sectorTrabajoOtro ?? "",
      ocupacionCargo: p.ocupacionCargo ?? "",
      trabajaEnEstadistica: p.trabajaEnEstadistica,
      tiempoInsercionLaboralMeses: p.tiempoInsercionLaboralMeses != null ? String(p.tiempoInsercionLaboralMeses) : "",
      observaciones: p.observaciones ?? "",
    });
    setEditando(p);
    setCampoError({});
    setMsg(null);
    setEstadoCi({ estado: "idle", texto: "", color: "" });
    setModal("editar");
  };

  /** Edición: antes de guardar se muestra el diff y se pide confirmación. */
  const pedirConfirmacion = () => {
    if (!editando) return;
    const base = editando as unknown as Record<string, unknown>;
    const cambios = Object.keys(form)
      .map((k) => ({
        campo: k,
        antes: String(base[k] ?? ""),
        nuevo: String((form as unknown as Record<string, unknown>)[k] ?? ""),
      }))
      .filter((c) => c.antes.trim() !== c.nuevo.trim());
    if (cambios.length === 0) {
      guardar();
      return;
    }
    setConfirmarPersona({ cambios });
  };

  const guardar = async () => {
    setGuardando(true);
    setMsg(null);
    setCampoError({});
    try {
      const url = modal === "editar" && editando
        ? `/api/personas?ci=${encodeURIComponent(editando.cedulaIdentidad)}`
        : `/api/personas`;

      const res = await fetch(url, {
        method: modal === "editar" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();

      if (!res.ok) {
        setCampoError(j.campos ?? {});
        setMsg({
          tipo: "error",
          texto: j.codigo === "CI_DUPLICADA" ? j.error : j.error ?? "No se pudo guardar",
        });
        return;
      }

      const eraNuevo = modal === "nuevo";
      setModal("cerrado");
      if (eraNuevo) {
        setAvisoAlta(
          "Titulado/egresado añadido con éxito. Para su primer ingreso al portal debe utilizar su C.I."
        );
      }
      await cargar();
    } catch {
      setMsg({ tipo: "error", texto: "Error de red. Intente nuevamente." });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    const motivo = motivoBaja.trim();
    if (motivo.length < 3) {
      setMsg({ tipo: "error", texto: "Debe ingresar el motivo de la baja (mínimo 3 caracteres)." });
      return;
    }

    setGuardando(true);
    setMsg(null);
    try {
      if (modoBorrado === "masivo") {
        if (seleccionados.length === 0) return;
        const res = await fetch("/api/personas", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: seleccionados, motivo }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "No se pudo dar de baja los registros");
        setSeleccionados([]);
        setModal("cerrado");
        setAvisoAlta(
          `Se dieron de baja ${j.eliminados ?? seleccionados.length} registro(s). Motivo: "${motivo}".`
        );
        await cargar();
        return;
      }

      if (!editando) return;
      const res = await fetch(
        `/api/personas/${editando.id}?motivo=${encodeURIComponent(motivo)}`,
        { method: "DELETE" }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo dar de baja");
      setSeleccionados((prev) => prev.filter((id) => id !== editando.id));
      setModal("cerrado");
      setAvisoAlta(
        `Se dio de baja a ${editando.nombresApellidos} (${editando.cedulaIdentidad}). Motivo: "${motivo}".`
      );
      await cargar();
    } catch (e: any) {
      setMsg({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  // ── Reglas de la matriz condicional (important.md seccion 1) ───────────────
  const esTitulado = form.tipo === "TITULADO";
  const muestraInicio = !esTitulado && form.planeaTitularse === "SI";
  const muestraMotivo =
    !esTitulado &&
    (form.planeaTitularse === "NO" ||
      form.planeaTitularse === "NO_SABE" ||
      (form.planeaTitularse === "SI" && form.inicioProcesoTitulacion === "NO"));

  const err = (k: string) => campoError[k]?.[0];

  /** El botón Guardar se bloquea si falta un dato obligatorio ya conocido. */
  const sectorOtroIncompleto =
    txt(form, "sectorTrabajo") === "OTRO" && txt(form, "sectorTrabajoOtro").trim() === "";
  const ciOcupada = modal === "nuevo" && estadoCi.estado === "ocupada";
  const faltaCedula = txt(form, "cedulaIdentidad").trim().length < 4;
  const faltaNombre = txt(form, "nombresApellidos").trim().length < 3;
  const faltaGenero =
    txt(form, "genero") !== "MASCULINO" && txt(form, "genero") !== "FEMENINO";
  const guardarBloqueado =
    guardando || sectorOtroIncompleto || ciOcupada || faltaCedula || faltaNombre || faltaGenero;

  const idsVisibles = datos?.filas.map((p) => p.id) ?? [];
  const todosSeleccionados =
    idsVisibles.length > 0 && idsVisibles.every((id) => seleccionados.includes(id));

  const toggleUno = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTodos = () => {
    if (todosSeleccionados) {
      setSeleccionados((prev) => prev.filter((id) => !idsVisibles.includes(id)));
    } else {
      setSeleccionados((prev) => Array.from(new Set([...prev, ...idsVisibles])));
    }
  };

  const resumen = datos?.resumen;

  if (authLoading) return <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Verificando sesión…</div>;
  if (!user || (user.rol !== "admin" && user.rol !== "KARDEX")) return null;
  const esKardex = user.rol === "KARDEX";

  return (
    <>
      {confirmarPersona && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h2 className="font-black text-lg text-slate-900 dark:text-white">¿Está seguro de guardar estos cambios?</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Revise qué cambia antes de confirmar. Quedará registrado en el historial.</p>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl">
              {confirmarPersona.cambios.map((c) => (
                <div key={c.campo} className="p-3 text-sm">
                  <div className="font-bold text-slate-700 dark:text-slate-200">{c.campo}</div>
                  <div className="text-slate-500 dark:text-slate-400 line-through break-words">{c.antes || "(vacío)"}</div>
                  <div className="text-emerald-700 dark:text-emerald-400 font-semibold break-words">→ {c.nuevo || "(vacío)"}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmarPersona(null)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-sm">No, volver</button>
              <button onClick={() => { setConfirmarPersona(null); guardar(); }} className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm">Sí, guardar</button>
            </div>
          </div>
        </div>
      )}
      <LoadingOverlay visible={guardando} icon={<Loader2 className="w-7 h-7 animate-spin" />} title="Guardando" label="Registro" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {esKardex && <KardexNav activa="personas" ocultarExportar />}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={esKardex ? "/kardex/solicitudes" : "/admin/dashboard"}
              className="inline-flex items-center gap-2 text-sm font-bold px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <ArrowLeft className="w-4 h-4" /> {esKardex ? "Portal Kardex" : "Dashboard"}
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Registro de Titulados y Egresados
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Módulo 1 · Ingreso y mantenimiento de datos (Kardex + ficha laboral)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleExport("excel")}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm transition"
              title="Generar Excel en memoria RAM"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel ({tipo === "TITULADO" ? "Titulados" : tipo === "EGRESADO" ? "Egresados" : "Todos"})
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition"
              title="Generar CSV en memoria RAM"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <Link
              href="/admin/importar"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Upload className="w-4 h-4" /> Importar
            </Link>
            <button
              onClick={abrirNuevo}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Nueva persona
            </button>
          </div>
        </div>

        {avisoAlta && (
          <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {avisoAlta}
            </span>
            <button
              type="button"
              onClick={() => setAvisoAlta(null)}
              className="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Titulados", valor: resumen?.titulados ?? 0, icon: GraduationCap, color: "text-blue-900 dark:text-blue-400" },
            { label: "Egresados", valor: resumen?.egresados ?? 0, icon: BookOpen, color: "text-amber-800 dark:text-amber-400" },
            { label: "Total", valor: (resumen?.titulados ?? 0) + (resumen?.egresados ?? 0), icon: Users, color: "text-slate-900 dark:text-white" },
            { label: "Empleados", valor: resumen?.empleados ?? 0, icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-400" },
          ].map((c) => (
            <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</span>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{c.valor}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPagina(1); }}
              placeholder="Buscar por nombre o cédula…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }}
            className="text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
            <option value="TODOS">Todos los tipos</option>
            <option value="TITULADO">Solo titulados</option>
            <option value="EGRESADO">Solo egresados</option>
          </select>

          <select value={sector} onChange={(e) => { setSector(e.target.value); setPagina(1); }}
            className="text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
            <option value="TODOS">Todos los sectores</option>
            {Object.entries(ETIQUETA_SECTOR).filter(([k]) => k).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}
            className="text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
            <option value="TODOS">Todos los estados</option>
            <option value="EMPLEADO">Empleado</option>
            <option value="INDEPENDIENTE">Independiente</option>
            <option value="DESEMPLEADO">Desempleado</option>
          </select>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs font-bold text-red-800 dark:text-red-300 cursor-pointer">
            <input
              type="checkbox"
              checked={soloIncompletos}
              onChange={(e) => { setSoloIncompletos(e.target.checked); setPagina(1); }}
              className="w-3.5 h-3.5 rounded border-red-300 text-red-600 focus:ring-red-500"
            />
            Solo datos incompletos
          </label>

          <button onClick={cargar} title="Recargar"
            className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-blue-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition">
            <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Aviso sobre registros incompletos remarcados en rojo */}
        <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-xl px-4 py-2.5 text-xs text-red-800 dark:text-red-200 flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <span>
              Los registros remarcados en <b>color rojo</b> necesitan actualización en sus datos que no se pudieron obtener en su registro.
            </span>
          </span>
          {(resumen?.incompletos ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 font-black">
              {resumen?.incompletos} por completar
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {seleccionados.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs font-bold text-red-900 dark:text-red-200">
              {seleccionados.length} registro(s) seleccionado(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSeleccionados([])}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 transition"
              >
                Limpiar selección
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoBorrado("masivo");
                  setEditando(null);
                  setMotivoBaja("");
                  setMsg(null);
                  setModal("borrar");
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black bg-red-700 hover:bg-red-800 text-white shadow-sm transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Dar de baja seleccionados ({seleccionados.length})
              </button>
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      title="Seleccionar todos en esta página"
                      checked={todosSeleccionados}
                      onChange={toggleTodos}
                      disabled={idsVisibles.length === 0}
                      className="w-4 h-4 rounded border-slate-300 text-blue-900 focus:ring-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Persona</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Titulación / Egreso</th>
                  <th className="py-3 px-4">Situación laboral</th>
                  <th className="py-3 px-4">Ubicación</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cargando && datos === null && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">Cargando…</td></tr>
                )}
                {!cargando && datos?.filas.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">
                    No hay registros que coincidan con la búsqueda.
                  </td></tr>
                )}
                {datos?.filas.map((p) => {
                  const faltantes = camposFaltantesPersona(p);
                  const incompleto = faltantes.length > 0;
                  return (
                  <tr
                    key={p.id}
                    className={
                      incompleto
                        ? "bg-red-50/90 dark:bg-red-950/40 hover:bg-red-100/75 dark:hover:bg-red-950/60 border-l-4 border-l-red-500 transition"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                    }
                  >
                    <td className="py-3 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar a ${p.nombresApellidos}`}
                        checked={seleccionados.includes(p.id)}
                        onChange={() => toggleUno(p.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-900 focus:ring-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-8 h-8 rounded-full border text-xs font-black flex items-center justify-center shrink-0 ${
                            incompleto
                              ? "bg-red-100 dark:bg-red-900/60 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200"
                              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {ETIQUETA_GENERO[p.genero] ?? "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[240px]">{p.nombresApellidos}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.cedulaIdentidad}</p>
                          {incompleto && (
                            <p className="mt-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                              Falta: {faltantes.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        p.tipo === "TITULADO"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}>{p.tipo === "TITULADO" ? "Titulado" : "Egresado"}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {p.tipo === "TITULADO" ? (
                        <>
                          <p className="font-medium">{p.anioTitulacion ?? "—"}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.modalidadTitulacion ?? "—"}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">Egresó {p.anioEgreso ?? "—"}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.planeaTitularse === "SI" ? "Planea titularse"
                              : p.planeaTitularse === "NO_SABE" ? "No sabe"
                              : p.planeaTitularse === "NO" ? "No planea" : "—"}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-700 dark:text-slate-300">{ETIQUETA_ESTADO[p.estadoLaboral ?? ""] ?? "—"}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.sectorTrabajo === "OTRO" && p.sectorTrabajoOtro
                          ? p.sectorTrabajoOtro
                          : ETIQUETA_SECTOR[p.sectorTrabajo ?? ""] ?? "—"}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-[160px] truncate">
                      {p.ciudadRegionTrabajo || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(p)} title="Editar"
                          className="p-2 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setModoBorrado("uno");
                            setEditando(p);
                            setMotivoBaja("");
                            setMsg(null);
                            setModal("borrar");
                          }}
                          title="Dar de baja"
                          className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {datos && datos.paginas > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Página {datos.pagina} de {datos.paginas} · {datos.total} registros
              </span>
              <div className="flex gap-2">
                <button disabled={datos.pagina <= 1} onClick={() => setPagina((p) => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Anterior
                </button>
                <button disabled={datos.pagina >= datos.paginas} onClick={() => setPagina((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de alta / edición ─────────────────────────────────────────── */}
      {(modal === "nuevo" || modal === "editar") && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl my-8 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-2xl">
              <div>
                <h2 className="font-black text-base text-slate-900 dark:text-white">
                  {modal === "nuevo" ? "Nueva persona" : "Editar registro"}
                </h2>
              </div>
              <button onClick={() => setModal("cerrado")} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {msg && (
                <div className={`text-xs px-3 py-2 rounded-lg flex items-start gap-2 ${
                  msg.tipo === "ok"
                    ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
                    : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
                }`}>
                  {msg.tipo === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  {msg.texto}
                </div>
              )}

              {/* Tipo y datos Kardex */}
              <section>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-blue-900 dark:text-blue-400 mb-3">
                  Datos de Kardex (K)
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tipo *
                    <select value={txt(form, "tipo")} onChange={(e) => set("tipo", e.target.value)}
                      disabled={modal === "editar"}
                      className={inp}>
                      <option value="TITULADO">Titulado (obtuvo el título)</option>
                      <option value="EGRESADO">Egresado (pendiente de titularse)</option>
                    </select>
                    {modal === "editar" && (
                      <span className="block mt-1 text-[10px] text-slate-400">
                        Para cambiar el tipo, dé de baja el registro y cree uno nuevo.
                      </span>
                    )}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nombres y apellidos *
                    <EtiquetaKardex />
                    <input value={txt(form, "nombresApellidos")} onChange={(e) => set("nombresApellidos", e.target.value)} className={inp} />
                    {err("nombresApellidos") && <span className={errMsg}>{err("nombresApellidos")}</span>}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Cédula de identidad * (única)
                    <span className="ml-1 inline-flex items-center gap-1 align-middle text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                      K · no editable
                    </span>
                    <input
                      value={txt(form, "cedulaIdentidad")}
                      onChange={(e) => set("cedulaIdentidad", e.target.value)}
                      className={inp}
                      placeholder="1234567"
                      // La CI es la llave única de todo el registro. Cambiarla dejaría
                      // huérfanas las sesiones ya abiertas, la auditoría y los reportes
                      // exportados, así que se congela al editar. Para corregir una CI
                      // equivocada hay que dar de baja el registro y crear uno nuevo.
                      readOnly={modal === "editar"}
                      title={
                        modal === "editar"
                          ? "La cédula no se puede cambiar: es la llave única del registro"
                          : undefined
                      }
                    />
                    {err("cedulaIdentidad") && <span className={errMsg}>{err("cedulaIdentidad")}</span>}
                    {modal === "nuevo" && estadoCi.estado !== "idle" && (
                      <span className={`mt-1 block text-[11px] font-bold ${estadoCi.color}`}>
                        {estadoCi.texto}
                      </span>
                    )}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Género *
                    <EtiquetaKardex />
                    <select value={txt(form, "genero")} onChange={(e) => set("genero", e.target.value)} className={inp}>
                      <option value="">Seleccione…</option>
                      <option value="MASCULINO">Masculino</option>
                      <option value="FEMENINO">Femenino</option>
                    </select>
                    {err("genero") && <span className={errMsg}>{err("genero")}</span>}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Semestre de ingreso
                    <EtiquetaKardex />
                    <input value={txt(form, "semestreIngreso")} onChange={(e) => set("semestreIngreso", e.target.value)} placeholder="I/2016 o 2016" className={inp} />
                    {err("semestreIngreso") && <span className={errMsg}>{err("semestreIngreso")}</span>}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Semestre de egreso
                    <EtiquetaKardex />
                    <input value={txt(form, "semestreEgreso")} onChange={(e) => set("semestreEgreso", e.target.value)} placeholder="II/2020 o 2020" className={inp} />
                    {err("semestreEgreso") && <span className={errMsg}>{err("semestreEgreso")}</span>}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Año de egreso
                    <EtiquetaKardex />
                    <input type="number" value={txt(form, "anioEgreso")} onChange={(e) => set("anioEgreso", e.target.value)} className={inp} />
                  </label>

                  {esTitulado && (
                    <>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Año de titulación
                        <EtiquetaKardex />
                        <input type="number" value={txt(form, "anioTitulacion")} onChange={(e) => set("anioTitulacion", e.target.value)} className={inp} />
                        {err("anioTitulacion") && <span className={errMsg}>{err("anioTitulacion")}</span>}
                      </label>

                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Modalidad de titulación
                        <EtiquetaKardex />
                        <select value={txt(form, "modalidadTitulacion")} onChange={(e) => set("modalidadTitulacion", e.target.value)} className={inp}>
                          <option value="">Seleccione…</option>
                          {MODALIDADES_OFICIALES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        {err("modalidadTitulacion") && <span className={errMsg}>{err("modalidadTitulacion")}</span>}
                      </label>

                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                        Área de especialización
                        <EtiquetaKardex />
                        <input value={txt(form, "areaEspecializacion")} onChange={(e) => set("areaEspecializacion", e.target.value)} className={inp} />
                      </label>
                    </>
                  )}
                </div>
              </section>

              {/* Matriz condicional de egresados */}
              {!esTitulado && (
                <section className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-400 mb-3">
                    Situación de titulación
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      ¿Planea titularse?
                      <select value={txt(form, "planeaTitularse")} onChange={(e) => {
                        set("planeaTitularse", e.target.value);
                        // Limpiar los campos que dejan de aplicar
                        if (e.target.value !== "SI") set("inicioProcesoTitulacion", "");
                        if (e.target.value === "SI") set("motivoNoTitulacion", "");
                      }} className={inp}>
                        <option value="">Seleccione…</option>
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                        <option value="NO_SABE">No sabe</option>
                      </select>
                      {err("planeaTitularse") && <span className={errMsg}>{err("planeaTitularse")}</span>}
                    </label>

                    {muestraInicio && (
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        ¿Inició proceso de titulación?
                        <select value={txt(form, "inicioProcesoTitulacion")} onChange={(e) => {
                          set("inicioProcesoTitulacion", e.target.value);
                          if (e.target.value === "SI") set("motivoNoTitulacion", "");
                        }} className={inp}>
                          <option value="">Seleccione…</option>
                          <option value="SI">Sí</option>
                          <option value="NO">No</option>
                        </select>
                        {err("inicioProcesoTitulacion") && <span className={errMsg}>{err("inicioProcesoTitulacion")}</span>}
                      </label>
                    )}

                    {muestraMotivo && (
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Motivo de no titulación
                        <select value={txt(form, "motivoNoTitulacion")} onChange={(e) => set("motivoNoTitulacion", e.target.value)} className={inp}>
                          <option value="">Seleccione…</option>
                          {[
                            ["LABORAL", "Laboral"], ["ECONOMICO", "Económico"], ["PERSONAL", "Personal"],
                            ["EN_PROCESO", "En proceso"], ["OTRO", "Otro"],
                          ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        {err("motivoNoTitulacion") && <span className={errMsg}>{err("motivoNoTitulacion")}</span>}
                      </label>
                    )}
                  </div>
                </section>
              )}

              {/* Ficha laboral */}
              <section>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-400 mb-3">
                  Ficha laboral y contacto
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estado laboral
                    <select value={txt(form, "estadoLaboral")} onChange={(e) => set("estadoLaboral", e.target.value)} className={inp}>
                      <option value="EMPLEADO">Empleado</option>
                      <option value="DESEMPLEADO">Desempleado</option>
                      <option value="INDEPENDIENTE">Independiente</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Sector donde trabaja
                    <select value={txt(form, "sectorTrabajo")} onChange={(e) => set("sectorTrabajo", e.target.value)} className={inp}>
                      <option value="">Sin especificar</option>
                      {Object.entries(ETIQUETA_SECTOR).filter(([k]) => k).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>

                  {form.sectorTrabajo === "OTRO" && (
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                      Especifique el sector *
                      <input value={txt(form, "sectorTrabajoOtro")} onChange={(e) => set("sectorTrabajoOtro", e.target.value)} className={inp} placeholder="Ej. Gobierno municipal, consultora…" />
                      {err("sectorTrabajoOtro") && <span className={errMsg}>{err("sectorTrabajoOtro")}</span>}
                    </label>
                  )}

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Trabaja en el área de Estadística
                    <select value={form.trabajaEnEstadistica ? "SI" : "NO"}
                      onChange={(e) => set("trabajaEnEstadistica", e.target.value === "SI")} className={inp}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Ocupación / cargo
                    <input value={txt(form, "ocupacionCargo")} onChange={(e) => set("ocupacionCargo", e.target.value)} className={inp} />
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Ciudad / región (o país)
                    <input value={txt(form, "ciudadRegionTrabajo")} onChange={(e) => set("ciudadRegionTrabajo", e.target.value)} className={inp} placeholder="Ej. La Paz, Bolivia" />
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Correo electrónico
                    <input type="email" value={txt(form, "correoElectronico")} onChange={(e) => set("correoElectronico", e.target.value)} className={inp} />
                    {err("correoElectronico") && <span className={errMsg}>{err("correoElectronico")}</span>}
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Teléfono
                    <input value={txt(form, "telefono")} onChange={(e) => set("telefono", e.target.value)} className={inp} />
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tiempo de inserción laboral (meses)
                    <input type="number" min={0} value={txt(form, "tiempoInsercionLaboralMeses")} onChange={(e) => set("tiempoInsercionLaboralMeses", e.target.value)} className={inp} />
                  </label>

                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                    Observaciones (uso interno de la carrera)
                    <textarea rows={3} value={txt(form, "observaciones")} onChange={(e) => set("observaciones", e.target.value)} className={inp} />
                  </label>
                </div>
              </section>
            </div>

            {/* Pie */}
            <div className="sticky bottom-0 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl">
              {(sectorOtroIncompleto || ciOcupada || faltaGenero) && (
                <p className="text-[11px] text-red-600 dark:text-red-400 mr-auto">
                  {ciOcupada
                    ? "La cédula ya está registrada."
                    : sectorOtroIncompleto
                      ? "Especifique cuál es el otro sector para poder guardar."
                      : "Debe seleccionar el género (Masculino o Femenino)."}
                </p>
              )}
              <button onClick={() => setModal("cerrado")} className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={modal === "editar" ? pedirConfirmacion : guardar} disabled={guardarBloqueado}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                {guardando ? "Guardando…" : modal === "nuevo" ? "Registrar persona" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de baja (individual o masiva) ─────────────────────────────── */}
      {modal === "borrar" && (modoBorrado === "masivo" ? seleccionados.length > 0 : Boolean(editando)) && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="font-black text-base text-slate-900 dark:text-white">
                {modoBorrado === "masivo"
                  ? `Dar de baja a ${seleccionados.length} registro(s)`
                  : "Dar de baja"}
              </h2>
            </div>

            {modoBorrado === "masivo" ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                ¿Está seguro de dar de baja los <b>{seleccionados.length}</b> registros seleccionados?
              </p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                ¿Está seguro de dar de baja a <b>{editando!.nombresApellidos}</b> ({editando!.cedulaIdentidad})?
              </p>
            )}

            <div className="mt-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Es una <b>baja lógica</b>: el registro se conserva y queda marcado, porque los titulados
                y egresados son evidencia de acreditación. La acción queda registrada en la auditoría.
              </span>
            </div>

            <label className="block mt-4 text-xs font-bold text-slate-700 dark:text-slate-300">
              Motivo de la baja *
              <textarea
                rows={3}
                maxLength={500}
                value={motivoBaja}
                onChange={(e) => setMotivoBaja(e.target.value)}
                placeholder="Ej. Error de importación, registro duplicado…"
                className={inp}
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                Obligatorio (mínimo 3 caracteres). Se guardará en el historial de auditoría.
              </span>
            </label>

            {msg && <div className="mt-3 text-xs bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-lg px-3 py-2">{msg.texto}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal("cerrado")}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={guardando || motivoBaja.trim().length < 3}
                className="px-4 py-2 rounded-xl text-xs font-black bg-red-700 hover:bg-red-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guardando ? "Procesando…" : "Sí, dar de baja"}
              </button>
            </div>
          </div>
        </div>
      )}
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
        title={
          tipo === "TITULADO"
            ? "titulados"
            : tipo === "EGRESADO"
              ? "egresados"
              : "titulados y egresados"
        }
        formato={exportModal.formato}
        params={exportModal.params}
        aviso="La descarga se realiza mediante un enlace seguro que caduca en 5 minutos y solo puede usarse desde esta sesión."
      />
    </>
  );
}

const inp =
  "mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60";
const errMsg = "block mt-1 text-[11px] font-bold text-red-600 dark:text-red-400";