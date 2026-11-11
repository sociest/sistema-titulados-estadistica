/**
 * Envía un correo de prueba con la configuración SMTP del `.env`.
 *
 *   pnpm correo:probar tu-correo@gmail.com
 *
 * Sirve para validar las credenciales SMTP (local o producción) sin pasar por el
 * registro ni la recuperación de contraseña. No imprime contraseñas.
 */
import "../src/db/env";
import { correoConfigurado, enviarCorreoPrueba } from "../src/lib/correo";

async function main() {
  const destino = process.argv[2]?.trim();
  if (!destino) {
    console.error("Uso: pnpm correo:probar destino@correo.com");
    process.exit(1);
  }
  if (!correoConfigurado()) {
    console.error(
      "SMTP sin configurar. Copie .env.example a .env y complete SMTP_HOST, SMTP_USER,\n" +
        "SMTP_PASS y CORREO_REMITENTE."
    );
    process.exit(1);
  }
  console.log(`Enviando correo de prueba a ${destino} por ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}…`);
  const r = await enviarCorreoPrueba(destino);
  if (r.enviado) {
    console.log("✓ Enviado. Revise la bandeja de entrada (y spam).");
  } else {
    console.error(`✗ No se pudo enviar (${r.motivo}). Revise el mensaje de error de arriba.`);
    process.exit(1);
  }
}

main();
