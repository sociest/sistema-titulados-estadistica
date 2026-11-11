"use client";
import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { ChevronDown, X } from "lucide-react";
import { useTemaOscuro } from "@/lib/useTemaOscuro";
import { estilosTooltip } from "@/lib/graficoTema";
import {
  agruparPorSectorPrincipal,
  colorSectorPrincipal,
  colorSubcategoria,
  porcentaje,
  subcategoriasDeOtro,
  type SectorSerie,
} from "@/lib/sectores";

/**
 * Medidas de los gráficos en papel.
 *
 * En pantalla los donuts se dibujan con ResponsiveContainer, que mide el contenedor con un
 * ResizeObserver. Al imprimir, el motor cambia a media print y puede capturar la hoja antes de
 * que ese observer dispare: el resultado es que en papel el gráfico aparecía sin etiquetas o,
 * en el segundo pie, directamente sin dibujar. Por eso la versión de papel lleva medidas fijas
 * y se dibuja desde el primer render, sin depender de ninguna medición.
 *
 * Los anchos salen de la hoja A4 con los márgenes de @page (14 mm a cada lado): quedan unos
 * 688 px útiles, menos el padding de la tarjeta, unos 640 px. El desglose va en dos columnas,
 * así que cada mitad se queda con unos 280 px.
 */
const PAPEL = { ancho: 640, alto: 300 };
const PAPEL_MITAD = { ancho: 280, alto: 230 };

/** Etiqueta externa de un sector. Recharts la pinta con su gris por defecto (#808080), que
 *  sobre una tarjeta blanca queda justo en el umbral de legibilidad, así que va explícita. */
function EtiquetaSector(props: PieLabelRenderProps, color: string) {
  return (
    <text
      x={props.x}
      y={props.y}
      // Recharts tipa textAnchor como string abierto; React espera la unión de valores SVG.
      textAnchor={props.textAnchor as "start" | "middle" | "end"}
      dominantBaseline="central"
      fill={color}
      fontSize={11}
    >
      {`${props.name} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  );
}

type OpcionesDonut = {
  datos: SectorSerie[];
  colores: string[];
  textoEtiqueta: string;
  etiquetas: boolean;
  margen: { top: number; right: number; bottom: number; left: number };
  innerRadius: number;
  outerRadius: number;
  paddingAngle: number;
  /** Solo en pantalla: en papel no hay hover ni clic. */
  sectorHover: number | null;
  setSectorHover: (i: number | null) => void;
  onSelect?: (indice: number) => void;
  interactivo: boolean;
};

/**
 * El mismo <Pie> para pantalla y para papel; lo único que cambia es el contenedor. Se
 * construye el árbol de hijos una vez y se entrega a un PieChart con medidas fijas o a un
 * ResponsiveContainer, según el caso.
 */
function Graficar({
  datos,
  colores,
  textoEtiqueta,
  etiquetas,
  margen,
  innerRadius,
  outerRadius,
  paddingAngle,
  sectorHover,
  setSectorHover,
  onSelect,
  interactivo,
  tool,
  fijo,
}: OpcionesDonut & {
  tool: ReturnType<typeof estilosTooltip>;
  fijo?: { ancho: number; alto: number };
}) {
  const grafico = (
    <PieChart {...(fijo ? { width: fijo.ancho, height: fijo.alto } : {})} margin={margen}>
      <Pie
        data={datos}
        dataKey="valor"
        nameKey="name"
        cx="50%"
        cy="50%"
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        paddingAngle={paddingAngle}
        label={etiquetas ? (p: PieLabelRenderProps) => EtiquetaSector(p, textoEtiqueta) : undefined}
        labelLine={false}
        onMouseEnter={interactivo ? (_: unknown, i: number) => setSectorHover(i) : undefined}
        onMouseLeave={interactivo ? () => setSectorHover(null) : undefined}
        onClick={interactivo && onSelect ? (_: unknown, i: number) => onSelect(i) : undefined}
        style={{ cursor: interactivo ? "pointer" : "default", outline: "none" }}
      >
        {datos.map((s, i) => (
          <Cell
            key={s.key}
            fill={colores[i]}
            fillOpacity={interactivo && sectorHover !== null && sectorHover !== i ? 0.25 : 1}
            stroke={interactivo && sectorHover === i ? textoEtiqueta : "transparent"}
            strokeWidth={interactivo && sectorHover === i ? 2 : 0}
            className="transition-opacity duration-200"
          />
        ))}
      </Pie>
      <Tooltip {...tool} />
    </PieChart>
  );
  return fijo ? grafico : <ResponsiveContainer width="100%" height="100%">{grafico}</ResponsiveContainer>;
}

/**
 * Donut más listado del desglose de "Otros". Se usa dentro del modal (con el tema activo) y
 * también en el bloque que solo existe en papel.
 *
 * Las etiquetas inline solo se dibujan hasta ocho categorías: con más el texto se superpone, que
 * es justo el problema que motivó sacar el detalle del donut principal. El listado acompaña
 * siempre, así que ningún dato queda solo en una etiqueta ilegible.
 */
function PanelDetalleSector({
  detalle,
  total,
  oscuro,
  compacto = false,
}: {
  detalle: SectorSerie[];
  total: number;
  oscuro: boolean;
  /** Dos columnas fijas y donut más bajo: es el modo de papel, donde el ancho útil de una
      hoja A4 queda por debajo del breakpoint `md` y el layout se apilaría. */
  compacto?: boolean;
}) {
  const textoEtiqueta = oscuro ? "#e2e8f0" : "#334155";
  const tool = estilosTooltip(oscuro);
  const [sectorHover, setSectorHover] = useState<number | null>(null);

  const opciones: OpcionesDonut = {
    datos: detalle,
    colores: detalle.map((_, i) => colorSubcategoria(i)),
    textoEtiqueta,
    etiquetas: detalle.length <= 8,
    margen: { top: 8, right: 8, bottom: 8, left: 8 },
    innerRadius: 48,
    outerRadius: 88,
    paddingAngle: 2,
    sectorHover,
    setSectorHover,
    interactivo: !compacto,
  };

  return (
    <div
      className={`grid gap-6 items-center ${
        compacto ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"
      }`}
    >
      <div className={`${compacto ? "h-56" : "h-64"} w-full flex items-center justify-center`}>
        <Graficar
          {...opciones}
          tool={tool}
          {...(compacto ? { fijo: PAPEL_MITAD } : {})}
        />
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {detalle.map((s, i) => (
          <li
            key={s.key}
            className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: colorSubcategoria(i) }}
              />
              <span className="truncate text-slate-700 dark:text-slate-300">{s.name}</span>
            </span>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
              {s.valor}
              <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
                {porcentaje(s.valor, total)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Donut de distribución por sector laboral.
 *
 * El donut principal muestra solo las cuatro categorías principales más el agregado "Otros".
 * Mostrar todas a la vez genera una docena de rebanadas cuyas etiquetas se pisan y se salen del
 * borde del gráfico, así que el detalle de "Otros" vive en un modal al que se entra desde el
 * botón del pie o haciendo clic en esa rebanada.
 *
 * Al imprimir, el desglose se despliega solo debajo del pie principal y el botón se oculta: en
 * papel no hay a dónde hacer clic, y el informe debe llevar el dato completo. En pantalla el
 * botón sigue siempre visible.
 */
export default function GraficoSector({
  series,
  etiqueta,
  alto = "h-64",
}: {
  series: SectorSerie[];
  etiqueta: string;
  alto?: string;
}) {
  const oscuro = useTemaOscuro();
  const [sectorHover, setSectorHover] = useState<number | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const datos = useMemo(() => agruparPorSectorPrincipal(series), [series]);
  const detalle = useMemo(() => subcategoriasDeOtro(series), [series]);
  const totalDetalle = useMemo(
    () => (detalle.reduce((suma, s) => suma + s.valor, 0) as number),
    [detalle]
  );

  const textoEtiqueta = oscuro ? "#e2e8f0" : "#334155";
  const tool = estilosTooltip(oscuro);

  useEffect(() => {
    if (!detalleAbierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetalleAbierto(false);
    };
    document.addEventListener("keydown", alPulsar);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [detalleAbierto]);

  const principal: OpcionesDonut = {
    datos,
    colores: datos.map((s) => colorSectorPrincipal(s.key)),
    textoEtiqueta,
    etiquetas: true,
    // Margen lateral generoso: reserva el hueco que ocupan las etiquetas, que si no se cortan
    // contra el borde (la más larga es "Académico / Investigación").
    margen: { top: 8, right: 96, bottom: 8, left: 96 },
    innerRadius: 50,
    outerRadius: 85,
    paddingAngle: 3,
    sectorHover,
    setSectorHover,
    onSelect: (i) => {
      if (datos[i]?.key === "OTRO") setDetalleAbierto(true);
    },
    interactivo: true,
  };

  return (
    <>
      <div className={`solo-pantalla ${alto} w-full flex items-center justify-center`}>
        <Graficar {...principal} tool={tool} />
      </div>

      {/* El envoltorio lleva solo-impresion y el centrado va dentro: la regla de impresión
          fuerza display:block, que si noGANaría al flex del contenedor. */}
      <div className="solo-impresion">
        <div className="w-full flex items-center justify-center">
          <Graficar {...principal} tool={tool} fijo={PAPEL} interactivo={false} sectorHover={null} />
        </div>
      </div>

      {detalle.length > 0 && (
        <button
          type="button"
          onClick={() => setDetalleAbierto(true)}
          className="no-print mt-2 mx-auto flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Ver sectores laborales de opción otro ({detalle.length})
        </button>
      )}

      {/* Solo en papel: el desglose va ya incluido debajo del pie principal. El botón de la
          versión interactiva se oculta, y el título se declara como grupo de encabezado para
          que se repita si el bloque salta de hoja. */}
      {detalle.length > 0 && (
        <div className="solo-impresion sector-impresion mt-4 border-t border-slate-400 pt-3">
          <div className="tabla-impresion">
            <div className="tabla-impresion-titulo">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Detalle de sectores laborales de opción otro
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {etiqueta} · {totalDetalle} {totalDetalle === 1 ? "registro" : "registros"}
              </p>
            </div>
            <div className="tabla-impresion-cuerpo mt-3">
              <PanelDetalleSector detalle={detalle} total={totalDetalle} oscuro={false} compacto />
            </div>
          </div>
        </div>
      )}

      {detalleAbierto && detalle.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setDetalleAbierto(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de sectores laborales de opción otro"
            className="relative w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Sectores laborales de opción otro
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {etiqueta} · {totalDetalle} {totalDetalle === 1 ? "registro" : "registros"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetalleAbierto(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto">
              <PanelDetalleSector detalle={detalle} total={totalDetalle} oscuro={oscuro} />
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setDetalleAbierto(false)}
                className="rounded-lg bg-blue-900 dark:bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 dark:hover:bg-blue-600 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}