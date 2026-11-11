import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { UBICACION } from "@/lib/ubicacion";

/**
 * Pie de página global (se monta en `layout.tsx`).
 * Muestra los datos de contacto y el mapa de ubicación de la Carrera de Estadística.
 * Usa `--nav-bg` para seguir la paleta elegida en el Navbar.
 */
export default function Footer() {
  return (
    <footer
      className="no-print mt-10 border-t-4 border-[var(--estad-orange)] bg-[var(--nav-bg)] text-slate-200"
      aria-label="Información de contacto y ubicación"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Universidad Mayor de San Andrés</p>
            <h2 className="mt-1 text-xl font-black text-white">Carrera de Estadística</h2>
            <p className="mt-1 text-sm text-slate-300">Sistema de Seguimiento a Titulados y Egresados</p>
          </div>

          <ul className="space-y-3 text-sm">
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
                <a href="mailto:estadistica@umsa.bo" className="underline-offset-2 hover:underline">estadistica@umsa.bo</a>
                <br />
                <a href="mailto:kardex.estadistica@umsa.bo" className="underline-offset-2 hover:underline">kardex.estadistica@umsa.bo</a>
              </span>
            </li>
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span>
                +591 2 2441570
                <br />
                WhatsApp: +591 71500000
              </span>
            </li>
            <li className="flex gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span>Lunes a viernes, 08:30–16:30</span>
            </li>
          </ul>

        </div>

        <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-xl">
          <iframe
            title={`Mapa de ubicación: ${UBICACION.nombre}`}
            src={UBICACION.MAPA_EMBED_URL}
            className="block h-72 w-full border-0 sm:h-80 lg:h-full lg:min-h-[320px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-4 text-center text-xs text-slate-300">
        Carrera de Estadística · Universidad Mayor de San Andrés · La Paz, Bolivia
      </div>
    </footer>
  );
}
