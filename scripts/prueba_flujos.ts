/**
 * Pruebas de integración contra una base DESECHABLE (nombre que contenga "test").
 * Llama a los handlers reales de las rutas con sesiones reales. No toca la base de producción.
 *   DATABASE_URL=postgresql://.../sistitulados_test CSRF_DISABLED=1 tsx scripts/prueba_flujos.ts
 */
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, pool } from "../src/db";
import { usuarios, personas, solicitudTitulado, solicitudTituladoHistorial, auditLog } from "../src/db/schema";
import { crearToken, NOMBRE_COOKIE } from "../src/lib/sesion";
import { registrarSesion } from "../src/lib/sesiones";
import { hashPassword } from "../src/lib/password";
import * as usuariosRoute from "../src/app/api/usuarios/[id]/route";
import * as kardexRoute from "../src/app/api/kardex/solicitudes/route";
import * as personasRoute from "../src/app/api/personas/route";
import { asegurarCuentaKardex } from "./seed_kardex";

let fallos = 0;
function verificar(nombre: string, cond: boolean, extra = "") {
  console.log(`${cond ? "✔" : "✘"} ${nombre}${extra ? " · " + extra : ""}`);
  if (!cond) fallos++;
}

async function cookie(rol: string, idUsuario: number | null, idPersona: number | null, ci: string) {
  const datos = { sub: idUsuario ?? 0, rol, ci, nombre: rol, correo: null };
  const token = await crearToken(datos as any);
  await registrarSesion({ token, idUsuario, idPersona, ci, rol, expiracionMs: 3600_000 } as any);
  return `${NOMBRE_COOKIE}=${token}`;
}
function req(url: string, method: string, ck: string, body?: unknown) {
  return new NextRequest(`http://localhost:3001${url}`, {
    method,
    headers: { cookie: ck, "content-type": "application/json", origin: "http://localhost:3001" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/test/i.test(url)) throw new Error("Abortado: DATABASE_URL no es una base de pruebas");
  await db.execute(sql`TRUNCATE sesiones, solicitudtitulado_historial, solicitudtitulado_documentos, solicitudtitulado, personas, usuarios RESTART IDENTITY CASCADE`);

  // ── 1. Seed: sin KARDEX_SEED_EMAIL no se crea ninguna cuenta Kardex de fábrica ──
  delete process.env.KARDEX_SEED_EMAIL;
  const sinSeed = await asegurarCuentaKardex();
  const kardexUmsa = await db.select().from(usuarios).where(eq(usuarios.correo, "kardex@umsa.bo"));
  verificar("seed sin KARDEX_SEED_EMAIL no crea cuenta alguna", sinSeed === null && kardexUmsa.length === 0);

  // Usuarios de prueba
  const [admin] = await db.insert(usuarios).values({ nombre: "ADMIN PRUEBA", correo: "admin@prueba.bo", passwordHash: hashPassword("clave-admin-1"), rol: "admin", estado: "activo" }).returning();
  const [kardex] = await db.insert(usuarios).values({ nombre: "KARDEX PRUEBA", correo: "kardex@prueba.bo", passwordHash: hashPassword("clave-kardex-1"), rol: "KARDEX", estado: "activo" }).returning();
  const [temporal] = await db.insert(usuarios).values({ nombre: "TEMPORAL", correo: "temporal@prueba.bo", passwordHash: hashPassword("clave-temp-1"), rol: "KARDEX", estado: "activo" }).returning();
  const ckAdmin = await cookie("admin", admin!.id, null, "");
  const ckKardex = await cookie("KARDEX", kardex!.id, null, "");

  // Actividad previa del usuario temporal: una acción real de Kardex deja auditoría con su id.
  await db.insert(personas).values({ cedulaIdentidad: "7654321", nombresApellidos: "OTRA PERSONA", tipo: "EGRESADO", estadoRegistro: "VALIDADO" } as any);
  const [solPrev] = await db.insert(solicitudTitulado).values({ ci: "7654321", estado: "PENDIENTE" } as any).returning();
  const sesionTemp = await cookie("KARDEX", temporal!.id, null, "");
  if (solPrev) await kardexRoute.PATCH(req("/api/kardex/solicitudes", "PATCH", sesionTemp, { id: solPrev.id, estado: "RECHAZADO", detalle: "prueba" }));
  const previa = await db.execute(sql`select count(*)::int n from audit_log where id_usuario = ${temporal!.id}`);
  verificar("hay auditoría previa del usuario a borrar", (previa.rows[0] as any).n >= 1, `filas=${(previa.rows[0] as any).n}`);

  // ── 2. Borrado real de usuario ──
  const r1 = await usuariosRoute.DELETE(req(`/api/usuarios/${temporal!.id}`, "DELETE", ckAdmin), { params: { id: String(temporal!.id) } });
  const filaTemp = await db.select().from(usuarios).where(eq(usuarios.id, temporal!.id));
  verificar("DELETE usuario responde 200", r1.status === 200, `status ${r1.status}`);
  verificar("DELETE elimina la fila (no baja lógica)", filaTemp.length === 0);
  const sesTemp = await db.execute(sql`select count(*)::int n from sesiones where id_usuario = ${temporal!.id}`);
  verificar("sesiones del usuario eliminado se borran en cascada", (sesTemp.rows[0] as any).n === 0);
  const audElim = await db.execute(sql`select count(*)::int n from audit_log where accion='eliminar' and entidad='usuarios' and entidad_id=${temporal!.id}`);
  verificar("la baja queda en auditoría", (audElim.rows[0] as any).n === 1);
  const audPrevia = await db.execute(sql`select count(*)::int n from audit_log where id_usuario = ${temporal!.id}`);
  verificar("la auditoría previa del eliminado se conserva intacta", (audPrevia.rows[0] as any).n >= 1);
  const autoBorrado = await usuariosRoute.DELETE(req(`/api/usuarios/${admin!.id}`, "DELETE", ckAdmin), { params: { id: String(admin!.id) } });
  verificar("no se puede borrar la propia cuenta", autoBorrado.status === 400);

  // ── 3. Autogestión sin casilla de consentimiento ──
  const [egresado] = await db.insert(personas).values({
    cedulaIdentidad: "1234567", nombresApellidos: "PRUEBA EGRESADO", tipo: "EGRESADO", estadoRegistro: "VALIDADO",
    correoElectronico: "paramusicagb2021@gmail.com",
  } as any).returning();
  const ckEgresado = await cookie("EGRESADO", null, egresado!.id, "1234567");
  const r3 = await personasRoute.PATCH(req("/api/personas?ci=1234567", "PATCH", ckEgresado, { telefono: "70000000", correoElectronico: "paramusicagb2021@gmail.com" }));
  const cuerpo3: any = await r3.json().catch(() => ({}));
  verificar("autogestión guarda SIN consentimiento", r3.status === 200, `status ${r3.status} ${cuerpo3.error ?? ""}`);

  // ── 4. Kardex acepta: egresado → TITULADO y aviso por correo ──
  const [sol] = await db.insert(solicitudTitulado).values({ ci: "1234567", estado: "PENDIENTE" } as any).returning();
  const r4 = await kardexRoute.PATCH(req("/api/kardex/solicitudes", "PATCH", ckKardex, { id: sol!.id, estado: "ACEPTADO" }));
  verificar("Kardex acepta la solicitud (200)", r4.status === 200, `status ${r4.status}`);
  const [pAhora] = await db.select().from(personas).where(eq(personas.id, egresado!.id));
  verificar("persona pasa de EGRESADO a TITULADO", pAhora?.tipo === "TITULADO", `tipo=${pAhora?.tipo}`);
  verificar("estado de registro VALIDADO", pAhora?.estadoRegistro === "VALIDADO");
  const hist = await db.select().from(solicitudTituladoHistorial).where(eq(solicitudTituladoHistorial.solicitudId, sol!.id));
  verificar("historial de la solicitud registrado", hist.length === 1 && hist[0]!.estado === "ACEPTADO");

  // Rechazo sin motivo sigue exigido
  const [sol2] = await db.insert(solicitudTitulado).values({ ci: "1234567", estado: "PENDIENTE" } as any).returning();
  const r5 = await kardexRoute.PATCH(req("/api/kardex/solicitudes", "PATCH", ckKardex, { id: sol2!.id, estado: "RECHAZADO" }));
  verificar("rechazo sin motivo sigue bloqueado (400)", r5.status === 400);

  console.log(fallos === 0 ? "\nTODAS LAS PRUEBAS PASARON" : `\n${fallos} FALLO(S)`);
  await pool.end();
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error("ERROR EN PRUEBA:", e); await pool.end(); process.exit(2); });
