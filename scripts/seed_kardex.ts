import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { usuarios } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

// Sin valor por defecto: el correo sale solo de KARDEX_SEED_EMAIL (se lee al ejecutar, no al
// importar). No se crea ninguna cuenta Kardex "de fábrica" (antes se creaba kardex@umsa.bo).

export async function asegurarCuentaKardex(): Promise<{ correo: string; password: string } | null> {
  const CORREO_KARDEX = (process.env.KARDEX_SEED_EMAIL || "").trim().toLowerCase();
  if (!CORREO_KARDEX) {
    console.warn("[seed] KARDEX_SEED_EMAIL no está definida: no se crea usuario Kardex.");
    return null;
  }
  const existente = await db
    .select({ rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.correo, CORREO_KARDEX))
    .limit(1);

  if (existente.length) {
    if (existente[0]!.rol !== "KARDEX") {
      throw new Error(`El correo ${CORREO_KARDEX} ya pertenece a un usuario con otro rol.`);
    }
    return null;
  }

  const password = process.env.KARDEX_SEED_PASSWORD;
  // Sin KARDEX_SEED_PASSWORD en el entorno no se crea la cuenta: no hay contraseña por defecto.
  if (!password) {
    console.warn("[seed] KARDEX_SEED_PASSWORD no está definida en .env: no se crea el usuario Kardex.");
    return null;
  }
  if (password.length < 8) throw new Error("KARDEX_SEED_PASSWORD debe tener al menos 8 caracteres.");

  const [creada] = await db
    .insert(usuarios)
    .values({
      ci: null,
      nombre: "USUARIO KARDEX",
      correo: CORREO_KARDEX,
      passwordHash: hashPassword(password),
      rol: "KARDEX",
      estado: "activo",
    })
    .onConflictDoNothing({ target: usuarios.correo })
    .returning({ id: usuarios.id });

  return creada ? { correo: CORREO_KARDEX, password } : null;
}