/**
 * Envío de correo (Resend gratuito o SMTP).
 *
 * El adaptador prioriza Resend (HTTP, sin dependencia adicional) y conserva SMTP:
 *
 *   1. Con `RESEND_API_KEY` y `RESEND_FROM`, envía mediante la API de Resend.
 *   2. Con SMTP configurado, envía mediante Nodemailer.
 *   3. Sin proveedor, NO simula un envío: escribe el enlace de verificación en el log y
 *      devuelve `enviado: false` con el enlace, para que el flujo se pueda probar y
 *      auditar. En producción esto debería considerarse un fallo de configuración.
 *
 * `SITIO_URL` es la base pública (http://localhost:3000 en desarrollo) de los enlaces.
 */

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

export function correoConfigurado(): boolean {
  const haySendGrid = Boolean(
    process.env.SENDGRID_API_KEY &&
      (process.env.SENDGRID_FROM || process.env.CORREO_REMITENTE)
  );
  const hayResend = Boolean(
    process.env.RESEND_API_KEY &&
      (process.env.RESEND_FROM || process.env.CORREO_REMITENTE)
  );
  const haySmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return haySendGrid || hayResend || haySmtp;
}

async function enviarCorreo(params: {
  destino: string;
  asunto: string;
  html: string;
  texto: string;
}): Promise<ResultadoEnvio> {
  const sendGridKey = process.env.SENDGRID_API_KEY;
  const remitenteSendGrid = process.env.SENDGRID_FROM ?? process.env.CORREO_REMITENTE;

  if (sendGridKey && remitenteSendGrid) {
    try {
      const sgMail = await import("@sendgrid/mail");
      sgMail.default.setApiKey(sendGridKey);
      await sgMail.default.send({
        to: params.destino,
        from: remitenteSendGrid,
        subject: params.asunto,
        html: params.html,
        text: params.texto,
      });
      return { enviado: true };
    } catch (e) {
      console.error("[correo] falló el envío con SendGrid:", e);
      return { enviado: false, motivo: "ERROR_DE_ENVIO" };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const remitenteResend = process.env.RESEND_FROM ?? process.env.CORREO_REMITENTE;

  if (apiKey && remitenteResend) {
    try {
      const respuesta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: remitenteResend,
          to: [params.destino],
          subject: params.asunto,
          html: params.html,
          text: params.texto,
        }),
      });

      if (!respuesta.ok) {
        console.error(`[correo] Resend rechazó el envío (HTTP ${respuesta.status}).`);
        return { enviado: false, motivo: "ERROR_DE_ENVIO" };
      }
      return { enviado: true };
    } catch (e) {
      console.error("[correo] falló el envío con Resend:", e);
      return { enviado: false, motivo: "ERROR_DE_ENVIO" };
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const especificador = "nodemail" + "er";
      const { createTransport } = (await import(/* webpackIgnore: true */ especificador)) as {
        createTransport: (opciones: unknown) => { sendMail: (msg: unknown) => Promise<unknown> };
      };
      const transporte = createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporte.sendMail({
        from: process.env.CORREO_REMITENTE ?? process.env.SMTP_USER,
        to: params.destino,
        subject: params.asunto,
        html: params.html,
        text: params.texto,
      });
      return { enviado: true };
    } catch (e) {
      console.error("[correo] falló el envío SMTP:", e);
      return { enviado: false, motivo: "ERROR_DE_ENVIO" };
    }
  }

  return { enviado: false, motivo: "SMTP_NO_CONFIGURADO" };
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