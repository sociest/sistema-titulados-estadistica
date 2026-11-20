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
  maxIntentos: number;
  primerIntento: number;
  bloqueadoHasta: number;
}

const REGISTROS = new Map<string, Registro>();

// Ventana y límites. 5 intentos por (IP + cuenta), 20 globales por cuenta, 25 por IP.
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS_PAR = 5;
const MAX_INTENTOS_ID = 20;
const MAX_INTENTOS_IP = 25;
const BLOQUEO_MS = 15 * 60 * 1000;
const MAX_REGISTROS_MEMORIA = 10_000;

// Limpieza periódica y cota dura de RAM para contenedor de 1 GB.
const ULTIMA_LIMPIEZA = { valor: 0 };

function limpiarSiHaceFalta(forzar = false) {
  const ahora = Date.now();
  if (!forzar && REGISTROS.size < MAX_REGISTROS_MEMORIA && ahora - ULTIMA_LIMPIEZA.valor < 60 * 1000) return;
  ULTIMA_LIMPIEZA.valor = ahora;
  REGISTROS.forEach((r, clave) => {
    if (r.bloqueadoHasta < ahora && ahora - r.primerIntento > VENTANA_MS) {
      REGISTROS.delete(clave);
    }
  });
  while (REGISTROS.size >= MAX_REGISTROS_MEMORIA) {
    const masAntigua = REGISTROS.keys().next().value;
    if (masAntigua === undefined) break;
    REGISTROS.delete(masAntigua);
  }
}

function descriptoresClaves(ip: string, identificador: string): Array<{ clave: string; max: number }> {
  const idNorm = identificador.slice(0, 160);
  const ipNorm = ip.slice(0, 45);
  return [
    { clave: `ip_id:${ipNorm}:${idNorm}`, max: MAX_INTENTOS_PAR },
    { clave: `ip:${ipNorm}`, max: MAX_INTENTOS_IP },
    { clave: `id:${idNorm}`, max: MAX_INTENTOS_ID },
  ];
}

export function verificarLimite(ip: string, identificador: string): { permitido: boolean; restantes: number; minutosEspera: number } {
  limpiarSiHaceFalta();
  const ahora = Date.now();

  let peorBloqueo = 0;
  let peorRestantes = MAX_INTENTOS_PAR;

  for (const { clave, max } of descriptoresClaves(ip, identificador)) {
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

    const restantes = Math.max(0, max - r.intentos);
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
  if (REGISTROS.size >= MAX_REGISTROS_MEMORIA) limpiarSiHaceFalta(true);
  const ahora = Date.now();
  for (const { clave, max } of descriptoresClaves(ip, identificador)) {
    const r = REGISTROS.get(clave);
    if (!r || ahora - r.primerIntento > VENTANA_MS) {
      REGISTROS.set(clave, { intentos: 1, maxIntentos: max, primerIntento: ahora, bloqueadoHasta: 0 });
      continue;
    }
    r.intentos++;
    if (r.intentos >= max) r.bloqueadoHasta = ahora + BLOQUEO_MS;
  }
}

/** Limpia solo el contador del par (IP + identificador) tras un login exitoso. */
export function limpiarIntentos(ip: string, identificador: string): void {
  REGISTROS.delete(`ip_id:${ip.slice(0, 45)}:${identificador.slice(0, 160)}`);
}

/** Solo para pruebas. */
export function reiniciarLimitador(): void {
  REGISTROS.clear();
}