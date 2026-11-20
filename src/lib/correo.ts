/**
 * Envío de correo por SMTP.
 *
 * Toda la configuración sale de variables de entorno (ver `.env.example`):
 *
 *   SMTP_HOST         servidor (p. ej. smtp-relay.brevo.com o smtp.gmail.com)
 *   SMTP_PORT         587 (STARTTLS, por defecto) o 465 (TLS implícito)
 *   SMTP_SECURE       "true" solo para TLS implícito; si se omite, es true únicamente con el 465
 *   SMTP_USER         usuario de autenticación SMTP
 *   SMTP_PASS         contraseña / clave SMTP / contraseña de aplicación
 *   CORREO_REMITENTE  cabecera From: "Sistema SEGUIT <correo@dominio>"
 *
 * Sin `SMTP_HOST` y `CORREO_REMITENTE` NO se simula un envío: se deja el enlace en el log
 * y se devuelve `enviado: false`, para poder probar el flujo en local. En producción eso
 * debe tratarse como un fallo de configuración.
 *
 * `SITIO_URL` es la base pública (http://localhost:3000 en desarrollo) de los enlaces.
 */

import { enviarPorSmtp, type OpcionesSmtp } from "@/lib/smtp";
import * as fs from "node:fs";
import * as path from "node:path";

export type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
};

const VIGENCIA_HORAS = 48;
const VIGENCIA_RECUPERACION_MINUTOS = 10;

function sitioUrl(): string {
  return (
    process.env.SITIO_URL?.replace(/\/+$/, "") ??
    (process.env.NODE_ENV === "production" ? "https://" : "http://localhost:3000")
  );
}

export function enlaceDeVerificacion(token: string): string {
  return `${sitioUrl()}/verificar?token=${token}`;
}

export function enlaceDeRecuperacion(token: string): string {
  return `${sitioUrl()}/recuperar?token=${token}`;
}

type ConfigSmtp = { opciones: OpcionesSmtp[]; remitente: string };

/**
 * Puertos que se prueban en orden cuando el configurado falla a nivel de conexión.
 *
 * Es la misma estrategia del script de referencia de Brevo (`test_smtp.py`): el puerto 587
 * con STARTTLS es el preferido, pero algunos cortafuegos y proveedores solo dejan pasar el
 * 2525 o el 465. Si `SMTP_FALLBACK=false`, se usa únicamente `SMTP_PORT`.
 */
const PUERTOS_DE_RESPALDO = [587, 2525, 465] as const;

function opcionesParaPuerto(
  base: { host: string; user?: string; pass?: string },
  port: number,
  secure: boolean,
  timeoutMs: number
): OpcionesSmtp {
  return { ...base, port, secure, timeoutMs };
}

function obtenerPasswordSmtp(): string | undefined {
  const envPass = process.env.SMTP_PASS?.trim();
  if (envPass && !envPass.startsWith("$") && !envPass.startsWith("${{")) {
    return envPass;
  }
  try {
    const posibles = [
      path.join(process.cwd(), "smtp_pass.txt"),
      path.join(process.cwd(), ".smtp_pass"),
      path.join(process.cwd(), "vcl2", "smtp_pass.txt"),
      "/app/smtp_pass.txt",
    ];
    for (const ruta of posibles) {
      if (fs.existsSync(ruta)) {
        const raw = fs.readFileSync(ruta, "utf-8");
        for (const linea of raw.split("\n")) {
          const l = linea.trim();
          if (!l || l.startsWith("#")) continue;
          if (l.startsWith("SMTP_PASS=")) {
            const val = l.substring("SMTP_PASS=".length).trim();
            if (val) return val;
          } else if (l) {
            return l;
          }
        }
      }
    }
  } catch {}
  return envPass && !envPass.startsWith("$") && !envPass.startsWith("${{") ? envPass : undefined;
}

function configuracionSmtp(): ConfigSmtp | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim() || undefined;
  const remitente = (process.env.CORREO_REMITENTE?.trim() || user || "").trim();
  if (!host || !remitente) return null;

  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  const secure = process.env.SMTP_SECURE?.trim()
    ? process.env.SMTP_SECURE.trim().toLowerCase() === "true"
    : port === 465;

  const pass = obtenerPasswordSmtp();
  // Con usuario, la contraseña es obligatoria: un SMTP a medio configurar es un error, no un envío.
  if (user && !pass) return null;

  const base = { host, user, pass };
  const opciones = [opcionesParaPuerto(base, port, secure, 15_000)];

  const respaldoActivo = process.env.SMTP_FALLBACK?.trim().toLowerCase() !== "false";
  if (respaldoActivo) {
    for (const alternativo of PUERTOS_DE_RESPALDO) {
      if (alternativo === port) continue;
      opciones.push(opcionesParaPuerto(base, alternativo, alternativo === 465, 10_000));
    }
  }

  return { opciones, remitente };
}

export function correoConfigurado(): boolean {
  return configuracionSmtp() !== null;
}

async function enviarCorreo(params: {
  destino: string;
  asunto: string;
  html: string;
  texto: string;
}): Promise<ResultadoEnvio> {
  const config = configuracionSmtp();
  if (!config) return { enviado: false, motivo: "SMTP_NO_CONFIGURADO" };

  // Se intenta el puerto configurado y, si falla, los de respaldo. Basta con que uno funcione.
  for (const [indice, opciones] of config.opciones.entries()) {
    try {
      await enviarPorSmtp(opciones, {
        from: config.remitente,
        to: params.destino,
        subject: params.asunto,
        html: params.html,
        text: params.texto,
      });
      if (indice > 0) {
        console.warn(
          `[correo] enviado por el puerto de respaldo ${opciones.port} (${opciones.secure ? "TLS" : "STARTTLS"}).`
        );
      }
      return { enviado: true };
    } catch (e) {
      // El mensaje de error nunca incluye la contraseña (ver smtp.ts).
      console.error(
        `[correo] falló el envío SMTP (${opciones.host}:${opciones.port}):`,
        e instanceof Error ? e.message : e
      );
    }
  }

  return { enviado: false, motivo: "ERROR_DE_ENVIO" };
}

/** Correo de prueba para validar credenciales: `pnpm correo:probar tu@correo.com`. */
export async function enviarCorreoPrueba(destino: string): Promise<ResultadoEnvio> {
  const asunto = "Prueba de correo — Sistema SEGUIT";
  const texto = "Si recibe este mensaje, el envío SMTP del Sistema SEGUIT funciona correctamente.";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2>Prueba de correo — Sistema SEGUIT</h2>
      <p>${texto}</p>
    </div>`;
  return enviarCorreo({ destino, asunto, html, texto });
}

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => {
    const entidades: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entidades[caracter]!;
  });
}

export async function enviarCorreoRecuperacion(params: {
  destino: string;
  nombre: string;
  token?: string;
  codigo?: string;
}): Promise<ResultadoEnvio> {
  const nombre = escaparHtml(params.nombre);
  const asunto = params.codigo
    ? `Su código de recuperación es ${params.codigo} — Sistema SEGUIT`
    : "Configure o recupere su contraseña — Sistema SEGUIT";

  const bloqueCodigo = params.codigo
    ? `
      <p>Su código de verificación de 6 dígitos para restablecer su contraseña es:</p>
      <div style="margin:24px 0;text-align:center">
        <span style="display:inline-block;background:#f1f5f9;color:#0f3a6b;font-size:32px;font-weight:bold;letter-spacing:8px;padding:14px 28px;border-radius:10px;border:2px dashed #0f3a6b;font-family:monospace">
          ${params.codigo}
        </span>
      </div>
      <p style="color:#64748b;font-size:14px">Este código expira en <strong>10 minutos</strong> y solo puede usarse una vez.</p>
    `
    : `
      <p>Use este enlace para configurar su contraseña por primera vez o elegir una nueva:</p>
      <p style="margin:24px 0">
        <a href="${enlaceDeRecuperacion(params.token || "")}"
           style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;
                  text-decoration:none;display:inline-block">Configurar contraseña</a>
      </p>
      <p>El enlace vence en 10 minutos y solo puede usarse una vez.</p>
    `;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1e293b">
      <h2 style="color:#0f3a6b;margin-bottom:8px">Universidad Mayor de San Andrés</h2>
      <h3 style="color:#475569;margin-top:0;font-weight:normal">Carrera de Estadística — Sistema SEGUIT</h3>
      <p>Hola <strong>${nombre}</strong>:</p>
      ${bloqueCodigo}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
      <p style="color:#94a3b8;font-size:13px">Si usted no realizó esta solicitud, puede ignorar este mensaje de forma segura.</p>
    </div>`.trim();

  const texto = [
    "Sistema SEGUIT — Universidad Mayor de San Andrés",
    "Carrera de Estadística",
    "",
    `Hola ${params.nombre}:`,
    params.codigo
      ? `Su código de recuperación de 6 dígitos es: ${params.codigo}\n\nEste código es válido por 10 minutos.`
      : `Use este enlace para configurar su contraseña: ${enlaceDeRecuperacion(params.token || "")}`,
    "",
    "Si usted no hizo esta solicitud, ignore este mensaje.",
  ].join("\n");

  return enviarCorreo({ destino: params.destino, asunto, html, texto });
}

function cuerpoCorreo(nombreCrudo: string, enlace: string): { asunto: string; html: string; texto: string } {
  const asunto = "Verifique su registro en el sistema SEGUIT";
  const nombreSeguro = escaparHtml(nombreCrudo);
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">Universidad Mayor de San Andrés — Facultad de Ciencias Puras y Naturales</h2>
      <p>Hola <strong>${nombreSeguro}</strong>:</p>
      <p>Recibimos su solicitud de registro en el Sistema de Seguimiento a Titulados y
         Egresados. Para que la Carrera de Estadística pueda validar sus datos,
         confirme que este correo le pertenece.</p>
      <p style="margin:24px 0">
        <a href="${enlace}"
           style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;
                  text-decoration:none;display:inline-block">Verificar mi correo</a>
      </p>
      <p style="color:#555;font-size:14px">
        El enlace vence en ${VIGENCIA_HORAS} horas y solo puede usarse una vez.
        Si usted no hizo esta solicitud, ignore este mensaje y no comparta el enlace.
      </p>
    </div>`.trim();

  const texto = [
    "Sistema SEGUIT — Universidad Mayor de San Andrés",
    "",
    `Hola ${nombreCrudo}:`,
    "Recibimos su solicitud de registro. Confirme que este correo le pertenece:",
    "",
    enlace,
    "",
    `El enlace vence en ${VIGENCIA_HORAS} horas y solo puede usarse una vez.`,
    "Si usted no hizo esta solicitud, ignore este mensaje.",
  ].join("\n");

  return { asunto, html, texto };
}

/**
 * Envía el correo de verificación. Nunca lanza: un fallo de envío se reporta, pero
 * el alta del registro ya está hecha y la interfaz necesita saber qué pasó.
 */
export async function enviarCorreoVerificacion(params: {
  destino: string;
  nombre: string;
  token: string;
}): Promise<ResultadoEnvio> {
  const enlace = enlaceDeVerificacion(params.token);
  const { asunto, html, texto } = cuerpoCorreo(params.nombre, enlace);

  if (!correoConfigurado()) {
    if (process.env.NODE_ENV === "production") {
      console.warn(`[correo] SMTP no configurado. No se envió el correo de verificación a ${params.destino}.`);
    } else {
      console.warn(
        `[correo] SMTP no configurado. No se envió el correo a ${params.destino}.\n` +
          `        Enlace de verificación (solo dev, vence en ${VIGENCIA_HORAS} h): ${enlace}`
      );
    }
    return { enviado: false, motivo: "SMTP_NO_CONFIGURADO" };
  }

  return enviarCorreo({ destino: params.destino, asunto, html, texto });
}
/**
 * Aviso al egresado cuando Kardex acepta su solicitud de titulación. Se envía después de
 * que el cambio ya quedó guardado: si el correo falla, la aceptación no se revierte.
 */
export async function enviarCorreoTitulado(params: {
  destino: string;
  nombre: string;
}): Promise<ResultadoEnvio> {
  const asunto = "Su solicitud de titulación fue aceptada — Carrera de Estadística";
  const nombre = escaparHtml(params.nombre || "");
  const texto =
    `Estimado/a ${params.nombre || ""}:\n\n` +
    "Su solicitud de titulación fue aceptada por Kardex. Su registro en el Sistema de Seguimiento " +
    "a Titulados ya figura como TITULADO.\n\n" +
    "Carrera de Estadística · UMSA";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2>Solicitud de titulación aceptada</h2>
      <p>Estimado/a ${nombre}:</p>
      <p>Su solicitud de titulación fue aceptada por Kardex. Su registro en el Sistema de Seguimiento
      a Titulados ya figura como <strong>TITULADO</strong>.</p>
      <p style="color:#64748b;font-size:12px">Carrera de Estadística · UMSA</p>
    </div>`;
  if (!correoConfigurado()) {
    console.warn(`[correo] SMTP no configurado. No se envió el aviso de titulación a ${params.destino}.`);
    return { enviado: false, motivo: "SMTP_NO_CONFIGURADO" };
  }
  return enviarCorreo({ destino: params.destino, asunto, html, texto });
}
