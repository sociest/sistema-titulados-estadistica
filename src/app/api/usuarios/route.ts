import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios, personas } from "@/db/schema";
import { count, desc, eq, or, sql } from "drizzle-orm";
import { exigirAdmin, verificarCsrf, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { hashPassword } from "@/lib/password";
import { registrarAuditoria } from "@/lib/auditoria";
import { usuarioConPasswordSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * Gestión de usuarios administradores.
 *
 * NO existía: la tabla `usuarios` estaba vacía y el admin entraba por un fallback
 * hardcodeado en el login. Ahora hay CRUD completo y toda contraseña se guarda hasheada.
 *
 * GET  /api/usuarios → listado (solo admin)
 * POST /api/usuarios → alta (solo admin)
 */

export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  try {
    const filas = await db
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        correo: usuarios.correo,
        ci: usuarios.ci,
        rol: usuarios.rol,
        estado: usuarios.estado,
        creadoEn: usuarios.creadoEn,
        // Nunca se devuelve passwordHash.
        ultimoAcceso: sql<string|null>`(SELECT max(a.creado_en) FROM audit_log a WHERE a.id_usuario = ${usuarios.id} AND a.entidad = 'sesion')`,
      })
      .from(usuarios)
      .orderBy(desc(usuarios.creadoEn));

    const [{ total }] = await db.select({ total: count() }).from(usuarios);

    return NextResponse.json({ filas, total });
  } catch (e) {
    return errorInterno(e, "api/usuarios GET");
  }
}

export async function POST(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseo = usuarioConPasswordSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: primerErrorZod(parseo.error), campos: parseo.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const datos = parseo.data;

    const existe = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(or(eq(usuarios.correo, datos.correo), datos.ci ? eq(usuarios.ci, datos.ci) : undefined))
      .limit(1);

    if (existe.length) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese correo o cédula", codigo: "DUPLICADO" },
        { status: 409 }
      );
    }

    const [creado] = await db
      .insert(usuarios)
      .values({
        nombre: datos.nombre,
        correo: datos.correo,
        ci: datos.ci ?? null,
        // La contraseña NUNCA se guarda en texto plano.
        passwordHash: hashPassword(datos.password),
        rol: datos.rol,
        estado: datos.estado,
      })
      .returning({
        id: usuarios.id,
        nombre: usuarios.nombre,
        correo: usuarios.correo,
        ci: usuarios.ci,
        rol: usuarios.rol,
        estado: usuarios.estado,
        creadoEn: usuarios.creadoEn,
      });

    await registrarAuditoria({
      accion: "crear",
      entidad: "usuarios",
      entidadId: creado!.id,
      idUsuario: await (await leerSesionDeRequest(req))?.sub ?? null,
      detalles: `Usuario creado: ${creado!.correo} (${creado!.rol}, ${creado!.estado})`,
      req,
    });

    return NextResponse.json(creado, { status: 201 });
  } catch (e) {
    return errorInterno(e, "api/usuarios POST");
  }
}