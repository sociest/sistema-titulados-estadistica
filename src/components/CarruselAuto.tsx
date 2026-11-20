"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, Megaphone, Newspaper, History, ArrowRight } from "lucide-react";
import { fmtFecha } from "@/components/Publicaciones";

/**
 * Carrusel automático reutilizable (autoplay, sin slider manual).
 *
 * Para qué: reemplazar los carruseles con scrollbar/botones de hitos, noticias
 * y convocatorias por uno que gira solo, con estilo aero glass (vidrio
 * esmerilado: backdrop-blur + borde translúcido) sobre la imagen de cada
 * diapositiva. Puntos indicadores clicables a la derecha.
 *
 * Comportamiento:
 *  - Avanza solo cada 5,5 s; se pausa con el cursor encima y cuando la pestaña
 *    no está visible.
 *  - Con un solo elemento muestra la tarjeta sin puntos (nada que cambiar).
 */
export interface SlideItem {
  key: string | number;
  /** Enlace al hacer clic (opcional: los hitos no llevan). */
  href?: string;
  imagenUrl?: string | null;
  /** Chip superior: "HITO 1 · 1974", "Noticia", "Convocatoria"... */
  etiqueta: string;
  /** noticia → azul, convocatoria → teal, hito → ámbar (solo chip y degradado). */
  tipo: "noticia" | "convocatoria" | "hito";
  fecha?: string;
  titulo: string;
  texto?: string;
}

export default function CarruselAuto({ items }: { items: SlideItem[] }) {
  const [indice, setIndice] = useState(0);
  const [pausa, setPausa] = useState(false);
  const visible = useRef(true);
  const total = items.length;

  useEffect(() => {
    if (total < 2) return;
    const t = setInterval(() => {
      if (!pausa && visible.current) setIndice((i) => (i + 1) % total);
    }, 5500);
    return () => clearInterval(t);
  }, [total, pausa]);

  useEffect(() => {
    const onVis = () => (visible.current = document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Corrección por si la lista se acorta con la carga (índice fuera de rango).
  const i = Math.min(indice, total - 1);
  const actual = items[i]!;
  const esConvocatoria = actual.tipo === "convocatoria";
  const esHito = actual.tipo === "hito";

  const chipIcono = esHito ? <History className="h-3 w-3" /> : esConvocatoria ? <Megaphone className="h-3 w-3" /> : <Newspaper className="h-3 w-3" />;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/25 shadow-2xl shadow-black/25"
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
    >
      <div className="relative h-[340px] sm:h-[400px]">
        {actual.imagenUrl ? (
          <img
            key={String(actual.key)}
            src={actual.imagenUrl}
            alt={actual.titulo}
            className="absolute inset-0 h-full w-full object-cover animate-[fadeIn_.6s_ease]"
          />
        ) : (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${
              esHito
                ? "from-slate-700 via-slate-900 to-slate-950"
                : esConvocatoria
                  ? "from-teal-700 via-teal-900 to-slate-950"
                  : "from-blue-800 via-blue-950 to-slate-950"
            }`}
          />
        )}
        {/* Veladura para legibilidad del vidrio */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-slate-950/10" />

        {/* Panel de vidrio (aero glass) con el contenido */}
        {actual.href ? (
          <Link
            href={actual.href}
            className="group absolute inset-x-3 bottom-3 sm:inset-x-5 sm:bottom-5 block rounded-2xl border border-white/35 bg-white/15 px-4 py-4 sm:px-6 sm:py-5 shadow-lg shadow-black/20 backdrop-blur-xl transition hover:bg-white/25"
          >
            <Contenido actual={actual} chipIcono={chipIcono} />
          </Link>
        ) : (
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-5 sm:bottom-5 rounded-2xl border border-white/35 bg-white/15 px-4 py-4 sm:px-6 sm:py-5 shadow-lg shadow-black/20 backdrop-blur-xl">
            <Contenido actual={actual} chipIcono={chipIcono} />
          </div>
        )}

        {/* Puntos indicadores (solo si hay más de una diapositiva) */}
        {total > 1 && (
          <div className="absolute right-4 top-4 flex flex-col gap-2">
            {items.map((it, n) => (
              <button
                key={it.key}
                type="button"
                aria-label={`Ir al elemento ${n + 1}`}
                onClick={() => setIndice(n)}
                className={`h-2.5 w-2.5 rounded-full border border-white/40 transition ${
                  n === i ? "bg-amber-300 scale-125" : "bg-white/25 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Contenido({ actual, chipIcono }: { actual: SlideItem; chipIcono: React.ReactNode }) {
  const esConvocatoria = actual.tipo === "convocatoria";
  const esHito = actual.tipo === "hito";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-white/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm ${
            esHito ? "bg-amber-500/30" : esConvocatoria ? "bg-teal-500/30" : "bg-blue-500/30"
          }`}
        >
          {chipIcono} {actual.etiqueta}
        </span>
        {actual.fecha && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/80">
            <Calendar className="h-3.5 w-3.5" /> {fmtFecha(actual.fecha)}
          </span>
        )}
      </div>
      <h4 className="mt-2.5 line-clamp-2 text-lg sm:text-2xl font-black uppercase leading-snug text-white drop-shadow">
        {actual.titulo}
      </h4>
      {actual.texto && (
        <p className="mt-1.5 line-clamp-2 hidden sm:block text-sm text-white/80 leading-relaxed">
          {actual.texto}
        </p>
      )}
      {actual.href && (
        <span className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-black text-amber-300 transition-all group-hover:gap-2.5">
          {esConvocatoria ? "Ver convocatoria" : esHito ? "" : "Leer más"} <ArrowRight className={esHito ? "hidden" : "h-3.5 w-3.5"} />
        </span>
      )}
    </>
  );
}
