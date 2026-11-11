/**
 * Estilos de gráficos compartidos por el dashboard público y el de administración.
 *
 * Un detalle que rompe el contraste si se olvida: `contentStyle.color` no basta. Recharts
 * pinta cada fila del tooltip como `<span class="recharts-tooltip-item" style="color:#808080">`
 * con el color en línea, que gana sobre el color heredado del contenedor. Por eso hay que
 * forzar el color en los tres sitios (contenido, label e item); si no, el texto del valor queda
 * gris sobre fondo oscuro y resulta ilegible.
 *
 * Tema pedido: en modo claro el tooltip va con fondo oscuro y letra blanca (contraste alto
 * sobre las tarjetas blancas); en modo oscuro se invierte a fondo blanco y letra negra, para que
 * destaque contra la tarjeta oscura en lugar de fundirse con ella.
 */

const FONDO_CLARO = "#0f172a";
const LETRA_CLARO = "#ffffff";
const FONDO_OSCURO = "#ffffff";
const LETRA_OSCURO = "#0f172a";

export type EstilosTooltip = {
  contentStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  itemStyle: React.CSSProperties;
  cursor: { fill: string };
};

/** Color de fondo/letra del tooltip según el tema. */
export function coloresTooltip(oscuro: boolean) {
  return oscuro
    ? { fondo: FONDO_OSCURO, letra: LETRA_OSCURO }
    : { fondo: FONDO_CLARO, letra: LETRA_CLARO };
}

/** Props del <Tooltip> de Recharts ya resueltas para el tema activo. */
export function estilosTooltip(oscuro: boolean, fontSize = 13): EstilosTooltip {
  const { fondo, letra } = coloresTooltip(oscuro);
  return {
    contentStyle: {
      backgroundColor: fondo,
      border: "none",
      borderRadius: "8px",
      padding: "8px 12px",
      fontSize: `${fontSize}px`,
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.35)",
    },
    labelStyle: { color: letra, fontWeight: 700 },
    itemStyle: { color: letra },
    cursor: { fill: oscuro ? "rgba(148, 163, 184, 0.25)" : "rgba(15, 23, 42, 0.06)" },
  };
}

/** Color de ejes y rejilla, que en modo oscuro necesita lighten o deja de leerse. */
export function estilosEjes(oscuro: boolean) {
  return {
    eje: oscuro ? "#94a3b8" : "#64748b",
    textoEje: oscuro ? "#cbd5e1" : "#475569",
    rejilla: oscuro ? "#94a3b8" : "#64748b",
  };
}