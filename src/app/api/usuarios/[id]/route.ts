import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno, verificarCsrf } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { hashPassword, verifyPassword } from "@/lib/password";
import { registrarAuditoria } from "@/lib/auditoria";
import { usuarioSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * /api/usuarios/[id]
 *   PATCH  → editar datos / cambiar estado / cambiar contraseña (solo admin)
 *   DELETE → baja (solo admin, y no se puede borrar a uno mismo)
 *
 * El admin se identifica por el campo `ci`: si coincide con una persona de `personas`,
 * esa persona puede entrar al sistema con su cédula y contraseña.
 */

function idInvalido(id: string) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const malo = idInvalido(params.id);
  if (malo) return malo;
  const id = Number(params.id);

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const actual = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!actual.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const antes = actual[0]!;

    const sesion = await leerSesionDeRequest(req);
    const patch: Record<string, unknown> = {};

      // ── Cambio de contraseña ────────────────────────────────────────────────
    if (body.password !== undefined && body.password !== "") {
      if (typeof body.password !== "string" || body.password.length < 8) {
        return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
      }
      // Siempre hay que confirmar la contraseña actual, sea el propio usuario o otro.
      const actualPass = (body.passwordActual ?? "").toString();
      if (!actualPass || !verifyPassword(actualPass, antes.passwordHash)) {
        return NextResponse.json(
          { error: "Debe confirmar su contraseña actual para cambiarla" },
          { status: 403 }
        );
      }
      patch.passwordHash = hashPassword(body.password);
    }

    // ── Datos del usuario ───────────────────────────────────────────────────
    const { password, passwordActual, ...datos } = body;
    if (Object.keys(datos).length) {
      const parseo = usuarioSchema.safeParse({ ...antes, ...datos });
      if (!parseo.success) {
        return NextResponse.json(
          { error: primerErrorZod(parseo.error), campos: parseo.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const v = parseo.data;
      patch.nombre = v.nombre;
      patch.correo = v.correo;
      patch.ci = v.ci ?? null;
      patch.rol = v.rol;
      patch.estado = v.estado;
    }

    // No dejar la carrera sin ningún administrador activo.
    if (antes.rol === "admin" && antes.estado === "activo") {
      const dejaDeSerAdmin =
        patch.rol !== undefined && patch.rol !== "admin";
      const dejaActivo = patch.estado !== undefined && patch.estado !== "activo";
      if (dejaDeSerAdmin || dejaActivo) {
        const otros = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(usuarios)
          .where(and(eq(usuarios.rol, "admin"), eq(usuarios.estado, "activo"), ne(usuarios.id, id)));
        if ((otros[0]?.n ?? 0) === 0) {
          return NextResponse.json(
            { error: "No se puede desactivar al único administrador activo" },
            { status: 400 }
          );
        }
      }
    }

    if (!Object.keys(patch).length)
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });

    patch.actualizadoEn = new Date();

    const [actualizado] = await db.update(usuarios).set(patch as any).where(eq(usuarios.id, id)).returning({
      id: usuarios.id,
      nombre: usuarios.nombre,
      correo: usuarios.correo,
      ci: usuarios.ci,
      rol: usuarios.rol,
      estado: usuarios.estado,
      creadoEn: usuarios.creadoEn,
    });

    const cambios = Object.keys(patch).filter((k) => k !== "actualizadoEn" && k !== "passwordHash");
    await registrarAuditoria({
      accion: "editar",
      entidad: "usuarios",
      entidadId: id,
      idUsuario: sesion?.sub ?? null,
      detalles: `Usuario ${actualizado!.correo} actualizado · ${cambios.join(", ") || "sin cambios"}${patch.passwordHash ? " · CONTRASEÑA CAMBIADA" : ""}`,
      datosAnteriores: Object.fromEntries(cambios.map((k) => [k, (antes as any)[k]])),
      datosNuevos: Object.fromEntries(cambios.map((k) => [k, (actualizado as any)[k]])),
      req,
    });

    return NextResponse.json(actualizado);
  } catch (e) {
    return errorInterno(e, "api/usuarios/[id] PATCH");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const malo = idInvalido(params.id);
  if (malo) return malo;
  const id = Number(params.id);

  const sesion = await leerSesionDeRequest(req);
  if (sesion?.sub === id) {
    return NextResponse.json({ error: "No puede eliminar su propia cuenta" }, { status: 400 });
  }

  try {
    const actual = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    if (!actual.length) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // No dejar la carrera sin administrador.
    if (actual[0]!.rol === "admin" && actual[0]!.estado === "activo") {
      const otros = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(usuarios)
        .where(and(eq(usuarios.rol, "admin"), eq(usuarios.estado, "activo"), ne(usuarios.id, id)));
      if ((otros[0]?.n ?? 0) === 0) {
        return NextResponse.json(
          { error: "No se puede eliminar al único administrador activo" },
          { status: 400 }
        );
      }
    }

    // Borrado real. Las sesiones del usuario se van en cascada (FK cascade). La auditoría es
    // inmutable y no tiene FK a usuarios (migración 0010): conserva el id de quien actuó.
    // La baja queda registrada con el correo y rol del eliminado.
    await db.delete(usuarios).where(eq(usuarios.id, id));

    await registrarAuditoria({
      accion: "eliminar",
      entidad: "usuarios",
      entidadId: id,
      idUsuario: sesion?.sub ?? null,
      detalles: `Usuario eliminado: ${actual[0]!.correo}`,
      datosAnteriores: { correo: actual[0]!.correo, rol: actual[0]!.rol, estado: actual[0]!.estado },
      datosNuevos: null,
      req,
    });


    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e, "api/usuarios/[id] DELETE");
  }
}