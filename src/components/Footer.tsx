"use client";

import { usePathname } from "next/navigation";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { UBICACION } from "@/lib/ubicacion";

/**
 * Pie de página global (se monta en `layout.tsx`).
 * Muestra los datos de contacto y, únicamente en páginas informativas públicas,
 * carga los mapas interactivos de ubicación para ahorrar memoria y red en paneles internos.
 */
export default function Footer() {
  const pathname = usePathname() || "";
  const mostrarMapas =
    pathname === "/titulados" ||
    pathname === "/noticias" ||
    pathname.startsWith("/noticias/") ||
    pathname.startsWith("/kpis/");

  return (
    <footer
      className="no-print relative isolate z-0 mt-10 border-t-4 border-[var(--estad-orange)] bg-[var(--nav-bg)] text-slate-200"
      aria-label="Información de contacto y ubicación"
    >
      <div
        className={`relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-start gap-8 px-6 py-10 ${
          mostrarMapas ? "lg:grid-cols-[minmax(260px,1fr)_1.15fr_1.15fr]" : "lg:grid-cols-2"
        }`}
      >
        <div className="space-y-5 text-center lg:text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
              Universidad Mayor de San Andrés
            </p>
            <h2 className="mt-1 text-xl font-black text-white">Carrera de Estadística</h2>
            <p className="mt-1 text-sm text-slate-300">
              Sistema de Seguimiento a Titulados y Egresados
            </p>
          </div>

          <ul className="inline-block space-y-3 text-sm text-left lg:inline-block">
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span>
                {UBICACION.direccion}
                <br />
                {UBICACION.ciudad}
              </span>
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span>
                <a
                  href="mailto:estadistica@umsa.bo"
                  className="underline-offset-2 hover:underline"
                >
                  estadistica@umsa.bo
                </a>
              </span>
            </li>
          </ul>
        </div>

        {mostrarMapas ? (
          <>
            <figure className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-xl">
              <figcaption className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                Monoblock Central
              </figcaption>
              <iframe
                title="Mapa de ubicación: Monoblock Central"
                src={UBICACION.MAPA_EMBED_URL}
                className="block h-56 w-full border-0 lg:h-72"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </figure>
            <figure className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-xl">
              <figcaption className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                Dirección Cota Cota
              </figcaption>
              <iframe
                title="Mapa de ubicación: Dirección Cota Cota"
                src={UBICACION.MAPA_EMBED_URL_COTA_COTA}
                className="block h-56 w-full border-0 lg:h-72"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </figure>
          </>
        ) : (
          <div className="flex flex-col items-center lg:items-end justify-center gap-3 text-sm text-left">
            <ul className="space-y-3">
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <span>
                  2442100 Secretaría 1 · 2612915 Secretaría 2
                </span>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <span>
                  Horario de oficina: 8:00 – 12:30 y 14:30 – 16:00
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>

      {mostrarMapas && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-white/10 px-6 py-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-amber-300" aria-hidden />
            2442100 Secretaría 1 · 2612915 Secretaría 2
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-300" aria-hidden />
            Horario de oficina: 8:00 – 12:30 y 14:30 – 16:00
          </span>
        </div>
      )}

      <div className="border-t border-white/10 px-6 py-4 text-center text-xs text-slate-300">
        Carrera de Estadística · Universidad Mayor de San Andrés · La Paz, Bolivia
      </div>
    </footer>
  );
}
