"use client";
import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Megaphone, Newspaper } from "lucide-react";

export interface NoticiaPublica {
  id: number;
  titulo: string;
  cuerpo: string;
  tipo: string;
  categoria: string;
  fecha: string;
  imagenUrl: string | null;
  publicado: boolean;
}

export function fmtFecha(f: string) {
  try {
    return new Date(f + "T00:00:00")
      .toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .toUpperCase();
  } catch {
    return f;
  }
}

export function CardPublicacion({ n }: { n: NoticiaPublica }) {
  const esConvocatoria = n.categoria === "convocatoria";
  return (
    <Link
      href={`/noticias/${n.id}`}
      className="group h-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition flex flex-col"
    >
      {n.imagenUrl ? (
        <div className="h-40 sm:h-44 overflow-hidden">
          <img src={n.imagenUrl} alt={n.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      ) : (
        <div className={`h-40 sm:h-44 flex flex-col items-center justify-center gap-2 text-white bg-gradient-to-br ${esConvocatoria ? "from-teal-700 via-teal-800 to-slate-900" : "from-blue-800 via-blue-900 to-slate-900"}`}>
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
            {esConvocatoria ? <Megaphone className="w-6 h-6" /> : <Newspaper className="w-6 h-6" />}
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
            {esConvocatoria ? "Convocatoria" : "Noticia"} · Carrera
          </p>
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-[11px] font-black tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" /> {fmtFecha(n.fecha)}
        </p>
        <h2 className="text-sm font-black text-[#0f2d52] dark:text-blue-300 uppercase mt-2 leading-snug">{n.titulo}</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed line-clamp-4">
          {n.cuerpo.split(/\n{2,}/)[0]}
        </p>
        <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-xs font-black text-teal-700 dark:text-teal-300 group-hover:gap-2.5 transition-all">
          {esConvocatoria ? "Leer convocatoria completa" : "Leer noticia completa"} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

export function claseSlideCarrusel(cantidad: number) {
  if (cantidad <= 1) return "shrink-0 basis-full snap-start";
  if (cantidad === 2) return "shrink-0 basis-full snap-start sm:basis-1/2";
  return "shrink-0 basis-full snap-start sm:basis-1/2 lg:basis-1/3";
}

export function CarruselHorizontal({ cantidad, children }: { cantidad: number; children: ReactNode }) {
  const pista = useRef<HTMLDivElement>(null);
  const desplazar = (direccion: -1 | 1) => {
    if (!pista.current) return;
    pista.current.scrollBy({ left: direccion * pista.current.clientWidth * 0.9, behavior: "smooth" });
  };
  const controlesVisibles = cantidad > 1;

  return (
    <div>
      {controlesVisibles && (
        <div className={`mb-3 flex justify-end gap-2 ${cantidad < 4 ? "lg:hidden" : ""}`}>
          <button type="button" onClick={() => desplazar(-1)} aria-label="Anterior" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => desplazar(1)} aria-label="Siguiente" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
      <div ref={pista} className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {children}
      </div>
    </div>
  );
}