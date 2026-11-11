/**
 * Servicio de verificación de Cloudflare Turnstile.
 * Permite validar tokens emitidos por el widget de Turnstile antes de procesar
 * acciones sensibles como login o registro.
 */

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function verificarTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<{ valido: boolean; motivo?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();

  // Cloudflare publica claves de prueba gratuitas. Se usan cuando NO hay una clave
  // real configurada en el entorno (desarrollo local o suite de integración):
  //   1x...  siempre pasa
  //   2x...  siempre falla
  //   3x...  pasa, pero exige interacción
  // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
  if (!secretKey || secretKey.startsWith("1x") || secretKey.startsWith("3x")) {
    console.warn(
      secretKey
        ? "[TURNSTILE] Clave de prueba de Cloudflare configurada: no se valida contra el servicio real."
        : "[TURNSTILE] TURNSTILE_SECRET_KEY no definida: se usa la versión gratuita de pruebas (siempre válida)."
    );
    return { valido: true };
  }

  if (secretKey.startsWith("2x")) {
    return {
      valido: false,
      motivo: "Verificación de seguridad fallida. Por favor, intente de nuevo.",
    };
  }

  if (!token || typeof token !== "string" || token.trim() === "") {
    return { valido: false, motivo: "Falta la verificación de seguridad (Turnstile)" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (remoteIp && remoteIp !== "desconocida") {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!res.ok) {
      console.error("[TURNSTILE] Error HTTP al verificar con Cloudflare:", res.status);
      return { valido: false, motivo: "No se pudo conectar con el servicio de validación de bots" };
    }

    const data: TurnstileVerifyResponse = await res.json();

    if (!data.success) {
      const errorMsg = data["error-codes"]?.join(", ") ?? "fallo desconocido";
      console.warn(`[TURNSTILE] Validación rechazada: ${errorMsg}`);
      return { valido: false, motivo: "Verificación de seguridad fallida. Por favor, intente de nuevo." };
    }

    return { valido: true };
  } catch (error) {
    console.error("[TURNSTILE] Excepción validando captcha:", error);
    return { valido: false, motivo: "Error interno al verificar protección anti-bots" };
  }
}
