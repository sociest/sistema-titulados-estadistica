/**
 * Utilidades de formato.
 *
 * Nota: aquí vivía `cn()`, que envolvía `clsx` + `tailwind-merge`. Se eliminó
 * porque ninguna parte del proyecto la usaba y ambas dependencias ni siquiera
 * estaban declaradas en package.json, lo que rompía `next build` con
 * "Cannot find module 'clsx'". Las clases se escriben directamente en el JSX.
 */

export function formatPorcentaje(valor: number): string {
  return `${(valor || 0).toFixed(1)}%`;
}

export function formatMeses(meses: number | null | undefined): string {
  if (meses === null || meses === undefined || isNaN(meses)) return "—";
  return `${meses.toFixed(1)} meses`;
}
