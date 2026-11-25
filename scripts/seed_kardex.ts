import { db } from "../src/db";
import { usuarios } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

export const KARDEX_CORREO = "kardex@gen.bo";
export const KARDEX_PASSWORD = "kardex123";

/**
 * Asegura la cuenta base de Kardex en la tabla `usuarios` con contraseña hasheada.
 * Si `sobrescribir` es true (--reset en desarrollo), restablece la contraseña base;
 * en caso contrario respeta cualquier cambio previo hecho desde /admin/usuarios.
 */
export async function asegurarCuentaKardex(
  sobrescribir = false
): Promise<{ correo: string; password: string }> {
  const hash = hashPassword(KARDEX_PASSWORD);

  if (sobrescribir) {
    await db
      .insert(usuarios)
      .values({
        ci: null,
        nombre: "Kardex",
        correo: KARDEX_CORREO,
        passwordHash: hash,
        rol: "KARDEX",
        estado: "activo",
      })
      .onConflictDoUpdate({
        target: usuarios.correo,
        set: {
          passwordHash: hash,
          rol: "KARDEX",
          estado: "activo",
        },
      });
  } else {
    await db
      .insert(usuarios)
      .values({
        ci: null,
        nombre: "Kardex",
        correo: KARDEX_CORREO,
        passwordHash: hash,
        rol: "KARDEX",
        estado: "activo",
      })
      .onConflictDoNothing({ target: usuarios.correo });
  }

  return { correo: KARDEX_CORREO, password: KARDEX_PASSWORD };
}
