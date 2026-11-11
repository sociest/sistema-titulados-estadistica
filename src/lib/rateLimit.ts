/**
 * Limitador de intentos en memoria, para el login.
 *
 * El reporte de pendientes marca esto como "recomendado"; sin él, alguien puede probar
 * contraseñas a fuerza bruta contra el login. No es un sustituto de un rate limiting
 * distribuido (si mañana hay varias instancias, este contador es por proceso), pero
 * cubre el caso real de un servidor único.
 *
 * Se guarda por IP + por identificador (correo o CI) para que atacar una sola cuenta
 * desde muchas máquinas tampoco funcione.
 */

interface Registro {
  intentos: number;
  primerIntento: number;
  bloqueadoHasta: number;
}

const REGISTROS = new Map<string, Registro>();

// Ventana y límites. 5 intentos por 15 minutos.
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

// Limpieza periódica para no crecer sin límite.
const ULTIMA_LIMPIEZA = { valor: 0 };

function limpiarSiHaceFalta() {
  const ahora = Date.now();
  if (ahora - ULTIMA_LIMPIEZA.valor < 5 * 60 * 1000) return;
  ULTIMA_LIMPIEZA.valor = ahora;
  for (const clave of Array.from(REGISTROS.keys())) {
    const r = REGISTROS.get(clave);
    if (!r) continue;
    if (r.bloqueadoHasta < ahora && ahora - r.primerIntento > VENTANA_MS) REGISTROS.delete(clave);
  }
}

function claves(ip: string, identificador: string): string[] {
  return [`ip:${ip}`, `id:${identificador}`];
}

export function verificarLimite(ip: string, identificador: string): { permitido: boolean; restantes: number; minutosEspera: number } {
  limpiarSiHaceFalta();
  const ahora = Date.now();

  let peorBloqueo = 0;
  let peorRestantes = MAX_INTENTOS;

  for (const clave of claves(ip, identificador)) {
    const r = REGISTROS.get(clave);
    if (!r) continue;

    if (r.bloqueadoHasta > ahora) {
      peorBloqueo = Math.max(peorBloqueo, r.bloqueadoHasta);
      peorRestantes = 0;
      continue;
    }

    // La ventana venció: se reinicia el contador.
    if (ahora - r.primerIntento > VENTANA_MS) {
      REGISTROS.delete(clave);
      continue;
    }

    const restantes = Math.max(0, MAX_INTENTOS - r.intentos);
    peorRestantes = Math.min(peorRestantes, restantes);
  }

  if (peorBloqueo > ahora) {
    return {
      permitido: false,
      restantes: 0,
      minutosEspera: Math.ceil((peorBloqueo - ahora) / 60000),
    };
  }
  return { permitido: true, restantes: peorRestantes, minutosEspera: 0 };
}

export function registrarIntento(ip: string, identificador: string): void {
  const ahora = Date.now();
  for (const clave of claves(ip, identificador)) {
    const r = REGISTROS.get(clave);
    if (!r || ahora - r.primerIntento > VENTANA_MS) {
      REGISTROS.set(clave, { intentos: 1, primerIntento: ahora, bloqueadoHasta: 0 });
      continue;
    }
    r.intentos++;
    if (r.intentos >= MAX_INTENTOS) r.bloqueadoHasta = ahora + BLOQUEO_MS;
  }
}

/** Limpia el contador tras un login exitoso. */
export function limpiarIntentos(ip: string, identificador: string): void {
  for (const clave of claves(ip, identificador)) REGISTROS.delete(clave);
}

/** Solo para pruebas. */
export function reiniciarLimitador(): void {
  REGISTROS.clear();
}