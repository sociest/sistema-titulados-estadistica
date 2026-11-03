import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { usuarios } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

const CORREO_KARDEX = (process.env.KARDEX_SEED_EMAIL || "kardex@umsa.bo").trim().toLowerCase();

export async function asegurarCuentaKardex(): Promise<{ correo: string; password: string } | null> {
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

  const password = process.env.KARDEX_SEED_PASSWORD || randomBytes(24).toString("base64url");
  // "krd" es la contraseña definida para el usuario Kardex (ver credenciales.txt)
  // Se permite de 3 caracteres minimum para este usuario especial
  if (password.length < 3) throw new Error("KARDEX_SEED_PASSWORD debe tener al menos 3 caracteres.");

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