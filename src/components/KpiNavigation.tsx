"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Users, ArrowRight } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function KpiNavigation() {
  const router = useRouter();
  const [navegando, setNavegando] = useState<string | null>(null);

  const ir = (href: string) => {
    if (navegando) return;
    setNavegando(href);
    setTimeout(() => router.push(href), 1000);
  };

  return (
    <>
      <LoadingOverlay
        visible={!!navegando}
        icon={
          navegando?.includes("titulados") ? (
            <GraduationCap className="w-7 h-7" />
          ) : (
            <Users className="w-7 h-7" />
          )
        }
        title="Cargando indicadores"
        label={navegando?.includes("titulados") ? "Titulados" : "Egresados"}
      />

      <div className="bg-gradient-to-br from-white via-sky-50 to-cyan-100 dark:from-[#14233a] dark:via-[#173246] dark:to-[#1a3a42] border border-sky-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-8 h-1 bg-teal-600 dark:bg-teal-300" />
          <p className="text-[13px] font-black tracking-[0.2em] text-teal-800 dark:text-teal-200 uppercase">
            Indicadores · Seguimiento
          </p>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-[#17344f] dark:text-white">
          Información estadística de <span className="text-[#d86524] dark:text-amber-300">graduados</span>
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 max-w-2xl">
          Consulte los indicadores de empleabilidad, tiempos de titulación e inserción laboral
          para cada grupo.
        </p>

        <div className="mt-8 grid gap-4">
          <button
            onClick={() => ir("/kpis/titulados")}
            className="group flex items-center gap-4 justify-between w-full text-left bg-gradient-to-r from-[#155f85] via-[#0e8790] to-[#158572] dark:from-[#136e9e] dark:via-[#0e887f] dark:to-[#bd682e] text-white rounded-2xl p-5 sm:p-6 shadow-lg hover:brightness-110 hover:shadow-xl transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-base sm:text-lg font-black leading-tight">
                  Ver info de los titulados
                </p>
                <p className="text-xs font-bold tracking-widest text-white/70 mt-0.5">
                  INDICADORES DE TITULADOS
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition" />
          </button>
        </div>
      </div>
    </>
  );
}