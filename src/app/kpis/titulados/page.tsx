import Link from "next/link";
import { GraduationCap, ChevronRight } from "lucide-react";
import PublicDashboard from "@/components/PublicDashboard";
import VolverSeguimiento from "@/components/VolverSeguimiento";

export default function KpisTituladosPage() {
  return (
    <div className="min-h-[calc(100vh-76px)] dark:bg-slate-950">
      <section className="bg-gradient-to-br text-white relative overflow-hidden" style={{ backgroundImage: `linear-gradient(to bottom right, var(--hero-from), var(--hero-via), #0f172a)` }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-6 py-8 lg:py-10 relative">
          <VolverSeguimiento className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-white/15 text-white border border-white/25 backdrop-blur hover:bg-white hover:text-[var(--hero-from)] shadow-sm transition mb-6" />
          <h1 className="mt-5 text-3xl lg:text-4xl font-black leading-tight flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center"><GraduationCap className="w-7 h-7" /></span>
            Indicadores de <span className="text-amber-300">Titulados</span>
          </h1>
          <p className="mt-3 text-blue-100 max-w-2xl text-sm sm:text-base">
            Empleabilidad directa, tiempo de egreso a titulación, inserción laboral y distribución por sector, geografía y modalidad.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-8">
        <PublicDashboard vista="TITULADOS" />
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-12">
        <Link href="/kpis/egresados" className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase opacity-60 hover:opacity-100 transition">
          <ChevronRight className="w-4 h-4" /> Ver indicadores de Egresados
        </Link>
      </section>
    </div>
  );
}