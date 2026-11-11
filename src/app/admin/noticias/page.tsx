"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  ArrowLeft,
  Newspaper,
  Megaphone,
  Trash2,
  Plus,
  Calendar,
  ImageIcon,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Upload,
  X,
} from "lucide-react";

interface Noticia {
  id: number;
  titulo: string;
  cuerpo: string;
  tipo: string;
  categoria: string;
  fecha: string;
  imagenUrl: string | null;
  publicado: boolean;
}

type Campos = {
  titulo: string;
  categoria: string;
  tipo: string;
  fecha: string;
  cuerpo: string;
  imagenUrl: string;
  publicado: boolean;
};

const ETIQUETAS: Record<keyof Campos, string> = {
  titulo: "Título",
  categoria: "Categoría",
  tipo: "Tipo",
  fecha: "Fecha",
  cuerpo: "Descripción",
  imagenUrl: "Imagen",
  publicado: "Publicado",
};

const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 5;

/** Solo http(s) o un archivo ya subido al sistema. Rechaza rutas locales (C:\, file://, etc.). */
function urlValida(v: string): boolean {
  if (v === "") return true;
  return /^https?:\/\/\S+$/i.test(v) || /^\/api\/noticias\/imagen\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(v);
}

function mostrarValor(campo: keyof Campos, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(vacío)";
  if (campo === "publicado") return v ? "Visible" : "Oculta";
  if (campo === "tipo") return String(v).replace(/_/g, " ");
  return String(v);
}

export default function AdminNoticiasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [noticias, setNoticias] = useState<Noticia[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [borrandoId, setBorrandoId] = useState<number | null>(null);

  // Formulario (alta o edición)
  const [editando, setEditando] = useState<Noticia | null>(null);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<"noticia" | "convocatoria">("noticia");
  const [tipo, setTipo] = useState("noticia_institucional");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [cuerpo, setCuerpo] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [publicado, setPublicado] = useState(true);

  // Subida de imagen
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  // Confirmación de cambios (solo edición)
  const [confirmar, setConfirmar] = useState<null | { cambios: { campo: keyof Campos; antes: string; nuevo: string }[]; datos: Campos }>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.rol !== "admin")) router.replace("/login");
  }, [authLoading, user, router]);

  const cargar = () => {
    fetch("/api/noticias?admin=1")
      .then((r) => r.json())
      .then((d) => setNoticias(Array.isArray(d) ? d : []))
      .catch(() => setNoticias([]));
  };

  useEffect(() => {
    if (user?.rol === "admin") cargar();
  }, [user]);

  const limpiarFormulario = () => {
    setEditando(null);
    setTitulo(""); setCuerpo(""); setImagenUrl("");
    setCategoria("noticia"); setTipo("noticia_institucional");
    setFecha(new Date().toISOString().slice(0, 10)); setPublicado(true);
  };

  const cargarEnFormulario = (n: Noticia) => {
    setEditando(n);
    setTitulo(n.titulo);
    setCuerpo(n.cuerpo);
    setCategoria(n.categoria as "noticia" | "convocatoria");
    setTipo(n.tipo);
    setFecha(String(n.fecha).slice(0, 10));
    setImagenUrl(n.imagenUrl ?? "");
    setPublicado(n.publicado);
    setMsg(""); setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const datosActuales = (): Campos => ({
    titulo: titulo.trim(),
    categoria,
    tipo,
    fecha,
    cuerpo: cuerpo.trim(),
    imagenUrl: imagenUrl.trim(),
    publicado,
  });

  const subirArchivo = async (archivo: File) => {
    setErr(""); setMsg("");
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      setErr("Formato no permitido: use JPG, PNG o WEBP");
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setErr(`La imagen supera ${MAX_MB} MB`);
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await fetch("/api/noticias/imagen", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo subir la imagen");
      setImagenUrl(j.url);
      setMsg("Imagen subida correctamente");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const onSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) subirArchivo(f);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setErr("");
    if (titulo.trim().length === 0) { setErr("El título es obligatorio"); return; }
    if (cuerpo.trim().length === 0) { setErr("La descripción es obligatoria"); return; }
    if (!urlValida(imagenUrl.trim())) {
      setErr("La imagen debe ser una URL que empiece por http:// o https://, o un archivo subido");
      return;
    }

    // Edición: primero se calcula el diff y se pide confirmación.
    if (editando) {
      const nuevos = datosActuales();
      const antes: Campos = {
        titulo: editando.titulo,
        categoria: editando.categoria,
        tipo: editando.tipo,
        fecha: String(editando.fecha).slice(0, 10),
        cuerpo: editando.cuerpo,
        imagenUrl: editando.imagenUrl ?? "",
        publicado: editando.publicado,
      };
      const cambios = (Object.keys(ETIQUETAS) as (keyof Campos)[])
        .filter((k) => String(antes[k] ?? "") !== String(nuevos[k] ?? ""))
        .map((k) => ({ campo: k, antes: mostrarValor(k, antes[k]), nuevo: mostrarValor(k, nuevos[k]) }));
      if (cambios.length === 0) {
        setMsg("No hay cambios que guardar");
        return;
      }
      setConfirmar({ cambios, datos: nuevos });
      return;
    }

    await crearNoticia();
  };

  const crearNoticia = async () => {
    setGuardando(true);
    try {
      const d = datosActuales();
      const res = await fetch("/api/noticias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al guardar");
      setMsg("Noticia publicada correctamente");
      limpiarFormulario();
      cargar();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEdicion = async () => {
    if (!confirmar || !editando) return;
    const datos = confirmar.datos;
    setConfirmar(null);
    setGuardando(true);
    try {
      const res = await fetch(`/api/noticias/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo guardar la edición");
      setMsg("Cambios guardados");
      limpiarFormulario();
      cargar();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (n: Noticia) => {
    setBorrandoId(n.id);
    setMsg(""); setErr("");
    try {
      await fetch(`/api/noticias/${n.id}`, { method: "DELETE" });
      if (editando?.id === n.id) limpiarFormulario();
      cargar();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBorrandoId(null);
    }
  };

  const input = "w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600";
  const lbl = "text-xs font-bold text-slate-700 dark:text-slate-300";

  if (authLoading) return <div className="max-w-4xl mx-auto p-8 text-sm text-slate-500 dark:text-slate-400">Verificando sesión...</div>;
  if (!user || user.rol !== "admin") return null;

  return (
    <>
      <LoadingOverlay
        visible={guardando}
        icon={<Loader2 className="w-7 h-7 animate-spin" />}
        title={editando ? "Guardando cambios" : "Publicando"}
        label="Noticia / convocatoria"
      />

      {/* Confirmación de cambios */}
      {confirmar && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h2 className="font-black text-lg text-slate-900 dark:text-white">¿Está seguro de guardar estos cambios?</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Revise qué cambia antes de confirmar. Quedará registrado en el historial.</p>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl">
              {confirmar.cambios.map((c) => (
                <div key={c.campo} className="p-3 text-sm">
                  <div className="font-bold text-slate-700 dark:text-slate-200">{ETIQUETAS[c.campo]}</div>
                  <div className="text-slate-500 dark:text-slate-400 line-through break-words">{c.antes}</div>
                  <div className="text-emerald-700 dark:text-emerald-400 font-semibold break-words">→ {c.nuevo}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmar(null)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-sm">No, volver</button>
              <button onClick={confirmarEdicion} className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm">Sí, guardar</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition shadow-sm">
            <ArrowLeft className="w-4 h-4" /> Volver al dashboard
          </Link>
          <div className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-400">
            Panel de administración · Noticias y Convocatorias
          </div>
        </div>

        {/* Formulario: alta o edición */}
        <form onSubmit={enviar} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
              {editando ? <Pencil className="w-5 h-5 text-amber-600" /> : <Plus className="w-5 h-5 text-blue-700 dark:text-blue-400" />}
              {editando ? `Editando: ${editando.titulo}` : "Nueva noticia / convocatoria"}
            </h1>
            {editando && (
              <button type="button" onClick={limpiarFormulario} className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-3.5 h-3.5" /> Cancelar edición
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className={`${lbl} sm:col-span-2`}>Título *<input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={250} placeholder="Ej. Convocatoria abierta: auxiliares de investigación 2026" className={input} /></label>
            <label className={lbl}>Categoría *
              <select value={categoria} onChange={(e) => setCategoria(e.target.value as any)} className={input}>
                <option value="noticia">Noticia</option>
                <option value="convocatoria">Convocatoria</option>
              </select>
            </label>
            <label className={lbl}>Tipo *
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>
                <option value="noticia_institucional">Noticia institucional</option>
                <option value="curso_evento">Curso / evento</option>
                <option value="noticia_social">Noticia social</option>
              </select>
            </label>
            <label className={lbl}>Fecha *<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} /></label>
            <label className={`${lbl} flex items-end gap-2`}>
              <span className="inline-flex items-center gap-1.5"><Eye className="w-4 h-4" /> Publicado</span>
              <button type="button" onClick={() => setPublicado((p) => !p)} className={`relative w-11 h-6 rounded-full transition ${publicado ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"}`} aria-label="Publicado">
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${publicado ? "translate-x-5" : ""}`} />
              </button>
            </label>

            {/* Imagen: arrastrar y soltar, botón Subir o URL */}
            <div className={`${lbl} sm:col-span-2`}>
              <span className="inline-flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> Imagen (opcional)</span>
              <div
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={onSoltar}
                className={`mt-2 rounded-xl border-2 border-dashed p-4 flex flex-col sm:flex-row items-center gap-4 transition ${arrastrando ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-slate-300 dark:border-slate-600"}`}
              >
                {imagenUrl && /^(https?:|\/api\/noticias\/imagen\/)/.test(imagenUrl) ? (
                  <img src={imagenUrl} alt="Vista previa" className="w-24 h-24 object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><ImageIcon className="w-8 h-8 text-slate-400" /></div>
                )}
                <div className="flex-1 w-full space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Arrastre una imagen aquí (JPG, PNG o WEBP, máx. {MAX_MB} MB) o use el botón.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)} placeholder="https://... o use Subir" className={`${input} mt-0`} />
                    <button type="button" onClick={() => inputArchivo.current?.click()} disabled={subiendo} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm disabled:opacity-50 shrink-0">
                      {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir
                    </button>
                    <input ref={inputArchivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivo(f); e.target.value = ""; }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <label className={lbl}>Descripción completa *<textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={6} placeholder="Requisitos, fechas, contacto, procedimiento... Use una línea en blanco entre párrafos." className={input} /></label>
          {msg && <div className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {msg}</div>}
          {err && <div className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{err}</div>}
          <button disabled={guardando} className="w-full bg-blue-900 hover:bg-blue-800 text-white rounded-xl py-2.5 font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : editando ? <>Guardar cambios</> : <>Publicar</>}
          </button>
        </form>

        {/* Listado */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-700 dark:text-blue-400" /> Publicaciones ({noticias?.length ?? 0})
            </h2>
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Gestionadas</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {noticias === null && <div className="p-6 text-sm text-slate-400">Cargando...</div>}
            {noticias?.length === 0 && <div className="p-6 text-sm text-slate-400">Aún no hay publicaciones.</div>}
            {noticias?.map((n) => (
              <div key={n.id} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 ${editando?.id === n.id ? "bg-amber-50/60 dark:bg-amber-950/30" : ""}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${n.categoria === "convocatoria" ? "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300" : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"}`}>
                  {n.categoria === "convocatoria" ? <Megaphone className="w-5 h-5" /> : <Newspaper className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{n.categoria}</span>
                    <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{n.tipo.replace(/_/g, " ")}</span>
                    <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${n.publicado ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                      {n.publicado ? <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Visible</span> : <span className="inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /> Oculta</span>}
                    </span>
                    <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {String(n.fecha).slice(0, 10)}</span>
                  </div>
                  <h3 className="text-sm font-black text-[#0f2d52] dark:text-blue-300 mt-2 leading-snug">{n.titulo}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{n.cuerpo}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link href={`/noticias/${n.id}`} target="_blank" className="p-2 rounded-lg text-xs font-bold text-blue-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 transition">Ver</Link>
                  <button onClick={() => cargarEnFormulario(n)} className="p-2 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 transition" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => eliminar(n)} disabled={borrandoId === n.id} className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
