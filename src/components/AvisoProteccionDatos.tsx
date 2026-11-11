import { ShieldCheck } from "lucide-react";

/**
 * Label de protección de datos que precede a los formularios del portal
 * (`/portal/titulado` y `/portal/egresado`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FUNDAMENTO LEGAL DE LA REDACCIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Este texto cita la Ley N° 1405 (Ley de Estadísticas Oficiales del Estado Plurinacional
 * de Bolivia, 1 de noviembre de 2021). Conviene tener presente QUE NO es una ley de
 * protección de datos personales como la 1818, sino de producción estadística. Lo que
 * aporta es el REGIMEN DE SECRETO ESTADÍSTICO, que es exactamente el aplicable a un
 * sistema que recoge información individual para publicar indicadores agregados.
 *
 *   · ARTÍCULO 5 (Secreto Estadístico), literal I —"La información proporcionada por
 *     los informantes no podrá ser revelada en forma individual y sólo podrá ser
 *     publicada de forma anonimizada." Es la base literal del aviso: los datos se
 *     publican agregados y anonimizados, nunca en forma individual.
 *
 *   · ARTÍCULO 4, literal a (definición de Anonimización) —"Proceso que expresa un
 *     dato relativo a entidades o personas, eliminando la referencia de su identidad."
 *     Es lo que sustenta el modelo de privacidad de este sistema: la referencia de
 *     identidad no se elimina borrando los datos, sino impidiendo que se publiquen. Las
 *     respuestas públicas son agregados y no incluyen ninguna columna identificativa.
 *
 *   · ARTÍCULO 5, literal I, segunda parte — la información no podrá ser utilizada con
 *     propósitos tributarios, judiciales, administrativos o policiales, aun medie orden
 *     administrativa o judicial. Es una garantía FUERTE a favor de la persona
 *     entrevistada, y el titular tiene derecho a conocerla: el aviso la menciona porque
 *     es la salvaguarda más valiosa del régimen.
 *
 *   · ARTÍCULO 22, literal f — las entidades productoras deben comunicar al informante
 *     los objetivos de la recolección de los datos, la protección del secreto
 *     estadístico y las sanciones aplicables. De ahí que este aviso exista y vaya antes
 *     de los campos, y no escondido al final.
 *
 *   · ARTÍCULO 8 — compromiso de confidencialidad del personal con acceso a la
 *     información, que sigue vigente aun después de que la persona deje sus funciones.
 *
 * Sobre las demás normas del proyecto (ISO/IEC 27001:2022 y su enmienda de 2024,
 * ISO/IEC 27701:2025, ISO/IEC 27002:2022, ISO/IEC 25010:2023) no se cita normativa
 * nacional: son estándares privados y su invocación en un aviso al titular podría
 * inducir a pensar que confers un cumplimiento certificable que la Universidad no ha
 * auditado. El marco normativo que obliga a la Carrera es la Ley 1405; las ISO orientan
 * el diseño técnico.
 */

/** Texto del aviso. Se exporta para poder reutilizarlo en otros formularios. */
export const AVISO_ESTADISTICO = {
  titulo: "Aviso de protección de datos y secreto estadístico",
  parrafos: [
    "Los datos que ingrese en este formulario se utilizan exclusivamente para elaborar estadísticas de seguimiento de titulados y egresados de la Carrera de Estadística.",
    "Conforme al Artículo 5 de la Ley N° 1405 de Estadísticas Oficiales, la información proporcionada no puede ser revelada de forma individual y solo se publica de forma anonimizada.",
  ],
} as const;

export default function AvisoProteccionDatos({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 text-xs leading-relaxed ${className}`}
    >
      <h2 className="flex items-center gap-2 text-sm font-black text-emerald-900 dark:text-emerald-200">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        {AVISO_ESTADISTICO.titulo}
      </h2>

      <div className="mt-2 space-y-2 text-emerald-900/90 dark:text-emerald-200/90">
        {AVISO_ESTADISTICO.parrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

    </section>
  );
}