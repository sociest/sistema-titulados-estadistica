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

export type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
};

const VIGENCIA_HORAS = 48;
const VIGENCIA_RECUPERACION_MINUTOS = 30;

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

type ConfigSmtp = { opciones: OpcionesSmtp; remitente: string };

function configuracionSmtp(): ConfigSmtp | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim() || undefined;
  const remitente = (process.env.CORREO_REMITENTE?.trim() || user || "").trim();
  if (!host || !remitente) return null;

  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  const secure = process.env.SMTP_SECURE?.trim()
    ? process.env.SMTP_SECURE.trim().toLowerCase() === "true"
    : port === 465;

  // Con usuario, la contraseña es obligatoria: un SMTP a medio configurar es un error, no un envío.
  if (user && !process.env.SMTP_PASS) return null;

  return {
    opciones: { host, port, secure, user, pass: process.env.SMTP_PASS },
    remitente,
  };
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

  try {
    await enviarPorSmtp(config.opciones, {
      from: config.remitente,
      to: params.destino,
      subject: params.asunto,
      html: params.html,
      text: params.texto,
    });
    return { enviado: true };
  } catch (e) {
    // El mensaje de error nunca incluye la contraseña (ver smtp.ts).
    console.error(`[correo] falló el envío SMTP (${config.opciones.host}:${config.opciones.port}):`, e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "ERROR_DE_ENVIO" };
  }
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
  token: string;
}): Promise<ResultadoEnvio> {
  const enlace = enlaceDeRecuperacion(params.token);
  const nombre = escaparHtml(params.nombre);
  const asunto = "Configure o recupere su contraseña — Sistema SEGUIT";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2>Universidad Mayor de San Andrés — Carrera de Estadística</h2>
      <p>Hola <strong>${nombre}</strong>:</p>
      <p>Use este enlace para configurar su contraseña por primera vez o elegir una nueva:</p>
      <p style="margin:24px 0">
        <a href="${enlace}"
           style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;
                  text-decoration:none;display:inline-block">Configurar contraseña</a>
      </p>
      <p>El enlace vence en ${VIGENCIA_RECUPERACION_MINUTOS} minutos y solo puede usarse una vez.
         Si usted no hizo esta solicitud, ignore este mensaje.</p>
    </div>`.trim();
  const texto = [
    "Sistema SEGUIT — Universidad Mayor de San Andrés",
    "",
    `Hola ${params.nombre}:`,
    "Use este enlace para configurar su contraseña por primera vez o elegir una nueva:",
    "",
    enlace,
    "",
    `El enlace vence en ${VIGENCIA_RECUPERACION_MINUTOS} minutos y solo puede usarse una vez.`,
    "Si usted no hizo esta solicitud, ignore este mensaje.",
  ].join("\n");

  return enviarCorreo({ destino: params.destino, asunto, html, texto });
}

function cuerpoCorreo(nombre: string, enlace: string): { asunto: string; html: string; texto: string } {
  const asunto = "Verifique su registro en el sistema SEGUIT";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">Universidad Mayor de San Andrés — Facultad de Ciencias</h2>
      <p>Hola <strong>${nombre}</strong>:</p>
      <p>Recibimos su solicitud de registro en el Sistema de Seguimiento a Titulados,
         Egresados y Units. Para que la Carrera de Estadística pueda validar sus datos,
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
    `Hola ${nombre}:`,
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
 * Envía el correo de verificación. Nunca lanza: un fallo de envío se reporta, pero la
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
    // Sin SMTP no hay mentira: se deja constancia en el log de qué se habría enviado.
    console.warn(
      `[correo] SMTP no configurado. No se envió el correo a ${params.destino}.\n` +
        `        Enlace de verificación (vence en ${VIGENCIA_HORAS} h): ${enlace}`
    );
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
