"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Calendar, Newspaper, Megaphone, FileText, Tag, Clock, Info } from "lucide-react";

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

const tipoLabel: Record<string, string> = {
  noticia_institucional: "Noticia institucional",
  curso_evento: "Curso / evento",
  noticia_social: "Noticia social",
};

export default function NoticiaDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const [n, setN] = useState<Noticia | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/noticias/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No encontrado"))))
      .then(setN)
      .catch((e) => setErr(e.message || "No encontrado"));
  }, [id]);

  return (
    <div className="min-h-screen dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Seguimiento a Titulados
        </button>

        {!n && !err && (
          <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center text-sm text-slate-400 animate-pulse">
            Cargando publicación...
          </div>
        )}

        {err && (
          <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center">
              <Info className="w-7 h-7" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Publicación no disponible</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{err}</p>
          </div>
        )}

        {n && (
          <article className="mt-8">
            {/* Imagen central */}
            {n.imagenUrl ? (
              <div className="rounded-3xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <img src={n.imagenUrl} alt={n.titulo} className="w-full max-h-[440px] object-cover" />
              </div>
            ) : (
              <div
                className={`rounded-3xl flex flex-col items-center justify-center bg-gradient-to-br text-white shadow-lg border border-white/10 h-64 sm:h-80 ${
                  n.categoria === "convocatoria"
                    ? "from-teal-700 via-teal-800 to-slate-900"
                    : "from-blue-800 via-blue-900 to-slate-900"
                }`}
              >
                <div className="w-20 h-20 rounded-3xl bg-white/15 border border-white/25 flex items-center justify-center animate-pulse">
                  {n.categoria === "convocatoria" ? (
                    <Megaphone className="w-10 h-10" />
                  ) : (
                    <Newspaper className="w-10 h-10" />
                  )}
                </div>
                <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] opacity-80">
                  {n.categoria === "convocatoria" ? "Convocatoria" : "Noticia"} · Carrera de Estadística
                </p>
              </div>
            )}

            {/* Cabecera */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                  n.categoria === "convocatoria"
                    ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                }`}
              >
                {n.categoria === "convocatoria" ? <Megaphone className="w-3.5 h-3.5" /> : <Newspaper className="w-3.5 h-3.5" />}
                {n.categoria}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Calendar className="w-3.5 h-3.5" /> {new Date(n.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
              </span>
            </div>

            <h1 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[#0f2d52] dark:text-white leading-tight">
              {n.titulo}
            </h1>

            {/* Ficha rápida estilo marketplace */}
            <div className="mt-8 grid sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0"><Tag className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Categoría</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 capitalize">{n.categoria}</p>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{tipoLabel[n.tipo] || n.tipo.replace(/_/g, " ")}</p>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0"><Clock className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Estado</p>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Vigente</p>
                </div>
              </div>
            </div>

            {/* Descripción completa */}
            <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm">
              <h2 className="text-base font-black uppercase tracking-widest text-[#0f2d52] dark:text-white mb-5">
                Descripción {n.categoria === "convocatoria" ? "de la convocatoria" : "completa"}
              </h2>
              <div className="space-y-4">
                {n.cuerpo
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i} className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                      {p}
                    </p>
                  ))}
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}