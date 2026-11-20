/**
 * Caché efímera en memoria para los indicadores agregados públicos (`/api/dashboard` sin filtros).
 *
 * Ocupa pocos KB y evita ejecutar 7 consultas agregadas en cada visita simultánea a la portada
 * o a `/kpis/*`, invalidándose al instante ante cualquier alta, edición, baja o importación.
 */

const TTL_MS = 15_000;

let entrada: { expiraEn: number; payload: unknown } | null = null;

export function leerCacheDashboard<T>(): T | null {
  if (!entrada) return null;
  if (Date.now() > entrada.expiraEn) {
    entrada = null;
    return null;
  }
  return entrada.payload as T;
}

export function guardarCacheDashboard(payload: unknown): void {
  entrada = { expiraEn: Date.now() + TTL_MS, payload };
}

export function invalidarCacheDashboard(): void {
  entrada = null;
}
