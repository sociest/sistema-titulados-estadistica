/**
 * Cliente SMTP mínimo, sin dependencias externas (solo `net` y `tls` de Node).
 *
 * Por qué existe: el Dockerfile instala con `pnpm install --frozen-lockfile`, así que
 * agregar `nodemailer` exige regenerar `pnpm-lock.yaml`. Para el volumen de este sistema
 * (correos de verificación y recuperación) basta un cliente pequeño y auditable.
 *
 * Soporta:
 *   · Puerto 587 con STARTTLS (Brevo, Gmail, Outlook, Mailgun…)  → `secure = false`
 *   · Puerto 465 con TLS implícito                                → `secure = true`
 *   · AUTH PLAIN y AUTH LOGIN
 *   · Servidores de prueba sin TLS ni credenciales (Mailpit, MailHog) si NO hay usuario
 *
 * Regla de seguridad: las credenciales jamás viajan sin cifrar. Si hay usuario y el
 * servidor no ofrece STARTTLS (y no es TLS implícito), el envío se aborta.
 */

import * as net from "node:net";
import * as os from "node:os";
import * as tls from "node:tls";
import { randomBytes } from "node:crypto";

export type OpcionesSmtp = {
  host: string;
  port: number;
  /** true = TLS implícito (puerto 465). false = texto plano + STARTTLS si el servidor lo ofrece. */
  secure: boolean;
  user?: string;
  pass?: string;
  /** Tiempo máximo de inactividad de la conexión. Por defecto 15 s. */
  timeoutMs?: number;
};

export type MensajeSmtp = {
  /** Cabecera From: admite "Nombre <correo@dominio>" o solo la dirección. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type Respuesta = { codigo: number; lineas: string[] };

/** Rechaza saltos de línea y caracteres que permitirían inyectar cabeceras o comandos. */
function direccionSegura(valor: string): string {
  const v = valor.trim();
  if (/[\r\n<>\s,;"]/.test(v) || !/^[^@]+@[^@]+\.[^@]+$/.test(v)) {
    throw new Error("Dirección de correo inválida");
  }
  return v;
}

/** Separa "Nombre <a@b.c>" en nombre visible y dirección. */
function separarRemitente(from: string): { nombre: string | null; direccion: string } {
  const m = from.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { nombre: m[1]?.trim() || null, direccion: direccionSegura(m[2]) };
  return { nombre: null, direccion: direccionSegura(from) };
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

/** Envuelve base64 a 76 columnas, como exige MIME. */
function b64Plegado(contenido: string): string {
  return b64(contenido).replace(/(.{76})/g, "$1\r\n");
}

/** Codifica un texto de cabecera como palabras codificadas RFC 2047 (UTF-8, base64). */
function cabeceraCodificada(texto: string): string {
  if (/^[\x20-\x7e]*$/.test(texto)) return texto;
  const palabras: string[] = [];
  let actual = "";
  for (const caracter of texto) {
    if (Buffer.byteLength(actual + caracter) > 42) {
      palabras.push(actual);
      actual = "";
    }
    actual += caracter;
  }
  if (actual) palabras.push(actual);
  return palabras.map((p) => `=?UTF-8?B?${b64(p)}?=`).join("\r\n ");
}

function construirMensaje(m: MensajeSmtp, destino: string): string {
  const { nombre, direccion } = separarRemitente(m.from);
  const dominio = direccion.split("@")[1];
  const limite = `=_seguit_${randomBytes(12).toString("hex")}`;
  const asunto = m.subject.replace(/[\r\n]+/g, " ");
  const deCabecera = nombre ? `${cabeceraCodificada(nombre)} <${direccion}>` : direccion;

  const cabeceras = [
    `From: ${deCabecera}`,
    `To: ${destino}`,
    `Subject: ${cabeceraCodificada(asunto)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomBytes(16).toString("hex")}@${dominio}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${limite}"`,
  ];

  const cuerpo = [
    `--${limite}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Plegado(m.text),
    `--${limite}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Plegado(m.html),
    `--${limite}--`,
    "",
  ];

  return [...cabeceras, "", ...cuerpo].join("\r\n");
}

/** Lector de respuestas SMTP (multilínea `250-…` / `250 …`) sobre un socket reemplazable. */
class Canal {
  private buffer = "";
  private lineas: string[] = [];
  private cola: Respuesta[] = [];
  private espera: { ok: (r: Respuesta) => void; fallo: (e: Error) => void } | null = null;
  private error: Error | null = null;
  socket!: net.Socket;

  constructor(socket: net.Socket, private readonly timeoutMs: number) {
    this.usar(socket);
  }

  /** Engancha un socket nuevo (se llama otra vez tras STARTTLS). */
  usar(socket: net.Socket): void {
    this.socket = socket;
    this.buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error("Tiempo de espera agotado con el servidor SMTP")));
    socket.on("data", (trozo: string) => {
      this.buffer += trozo;
      this.procesar();
    });
    socket.on("error", (e) => this.fallar(e));
    socket.on("close", () => this.fallar(new Error("El servidor SMTP cerró la conexión")));
  }

  /** Quita los listeners del socket actual antes de envolverlo en TLS. */
  soltar(): void {
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("close");
    this.socket.setTimeout(0);
  }

  private procesar(): void {
    let i: number;
    while ((i = this.buffer.indexOf("\r\n")) !== -1) {
      const linea = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      this.lineas.push(linea);
      if (/^\d{3}( |$)/.test(linea)) {
        const respuesta = { codigo: Number(linea.slice(0, 3)), lineas: this.lineas };
        this.lineas = [];
        if (this.espera) {
          const e = this.espera;
          this.espera = null;
          e.ok(respuesta);
        } else {
          this.cola.push(respuesta);
        }
      }
    }
  }

  private fallar(e: Error): void {
    if (!this.error) this.error = e;
    if (this.espera) {
      const w = this.espera;
      this.espera = null;
      w.fallo(this.error);
    }
  }

  leer(): Promise<Respuesta> {
    const lista = this.cola.shift();
    if (lista) return Promise.resolve(lista);
    if (this.error) return Promise.reject(this.error);
    return new Promise((ok, fallo) => {
      this.espera = { ok, fallo };
    });
  }

  escribir(dato: string): void {
    this.socket.write(dato);
  }

  async comando(linea: string, esperado: number[]): Promise<Respuesta> {
    this.escribir(`${linea}\r\n`);
    const r = await this.leer();
    if (!esperado.includes(r.codigo)) {
      throw new Error(`SMTP ${r.codigo}: ${r.lineas.join(" ").slice(0, 200)}`);
    }
    return r;
  }
}

function conectar(o: OpcionesSmtp): Promise<net.Socket> {
  return new Promise((ok, fallo) => {
    const alConectar = (s: net.Socket) => {
      s.removeListener("error", fallo);
      ok(s);
    };
    const socket = o.secure
      ? tls.connect({ host: o.host, port: o.port, servername: o.host }, () => alConectar(socket))
      : net.connect({ host: o.host, port: o.port }, () => alConectar(socket));
    socket.once("error", fallo);
  });
}

function actualizarATls(canal: Canal, host: string): Promise<void> {
  return new Promise((ok, fallo) => {
    canal.soltar();
    const seguro = tls.connect({ socket: canal.socket, servername: host }, () => {
      seguro.removeListener("error", fallo);
      canal.usar(seguro);
      ok();
    });
    seguro.once("error", fallo);
  });
}

/** Envía un mensaje. Lanza Error si el servidor lo rechaza o la conexión falla. */
export async function enviarPorSmtp(opciones: OpcionesSmtp, mensaje: MensajeSmtp): Promise<void> {
  const timeoutMs = opciones.timeoutMs ?? 15_000;
  const { direccion: remitente } = separarRemitente(mensaje.from);
  const destino = direccionSegura(mensaje.to);
  const crudo = construirMensaje(mensaje, destino);

  const socket = await conectar(opciones);
  const canal = new Canal(socket, timeoutMs);

  try {
    const saludo = await canal.leer();
    if (saludo.codigo !== 220) throw new Error(`SMTP ${saludo.codigo}: saludo inesperado`);

    const nombreLocal = (os.hostname() || "localhost").replace(/[^a-zA-Z0-9.-]/g, "") || "localhost";
    let ehlo = await canal.comando(`EHLO ${nombreLocal}`, [250]);
    const ofrece = (clave: string) => ehlo.lineas.some((l) => l.toUpperCase().includes(clave));

    if (!opciones.secure && ofrece("STARTTLS")) {
      await canal.comando("STARTTLS", [220]);
      await actualizarATls(canal, opciones.host);
      ehlo = await canal.comando(`EHLO ${nombreLocal}`, [250]);
    } else if (!opciones.secure && opciones.user) {
      throw new Error("El servidor SMTP no ofrece STARTTLS: no se envían credenciales sin cifrar");
    }

    if (opciones.user) {
      const pass = opciones.pass ?? "";
      if (ofrece("AUTH") && /AUTH[^\r\n]*\bPLAIN\b/i.test(ehlo.lineas.join("\n"))) {
        try {
          await canal.comando(`AUTH PLAIN ${b64(`\0${opciones.user}\0${pass}`)}`, [235]);
        } catch {
          throw new Error("El servidor SMTP rechazó el usuario o la contraseña");
        }
      } else {
        await canal.comando("AUTH LOGIN", [334]);
        await canal.comando(b64(opciones.user), [334]);
        try {
          await canal.comando(b64(pass), [235]);
        } catch {
          throw new Error("El servidor SMTP rechazó el usuario o la contraseña");
        }
      }
    }

    await canal.comando(`MAIL FROM:<${remitente}>`, [250]);
    await canal.comando(`RCPT TO:<${destino}>`, [250, 251]);
    await canal.comando("DATA", [354]);

    // Dot-stuffing: una línea que empiece con "." se duplica para no cortar el DATA.
    canal.escribir(`${crudo.replace(/^\./gm, "..")}\r\n.\r\n`);
    const fin = await canal.leer();
    if (fin.codigo !== 250) throw new Error(`SMTP ${fin.codigo}: ${fin.lineas.join(" ").slice(0, 200)}`);

    canal.escribir("QUIT\r\n");
  } finally {
    canal.socket.end();
    setTimeout(() => canal.socket.destroy(), 500).unref();
  }
}
