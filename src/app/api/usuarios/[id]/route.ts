import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { exigirAdmin, errorInterno, leerSesionVigente, verificarCsrf } from "@/lib/guards";
import { hashPasswordAsync, verifyPasswordAsync } from "@/lib/password";
import { registrarAuditoria } from "@/lib/auditoria";
import { revocarSesionesDeUsuario } from "@/lib/sesiones";
import {
  esPasswordIgualACredencial,
  passwordSeguraSchema,
  primerErrorZod,
  usuarioSchema,
} from "@/lib/validaciones";

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

    const sesion = await leerSesionVigente(req);
    const patch: Record<string, unknown> = {};

    // ── Cambio de contraseña ────────────────────────────────────────────────
    if (body.password !== undefined && body.password !== "") {
      const checkPass = passwordSeguraSchema.safeParse(body.password);
      if (!checkPass.success) {
        return NextResponse.json(
          { error: checkPass.error.issues[0]?.message ?? "Contraseña inválida" },
          { status: 400 }
        );
      }
      const ciObjetivo = typeof body.ci === "string" ? body.ci : antes.ci;
      const correoObjetivo = typeof body.correo === "string" ? body.correo : antes.correo;
      if (esPasswordIgualACredencial(checkPass.data, ciObjetivo, correoObjetivo)) {
        return NextResponse.json(
          { error: "Por seguridad, la contraseña no puede ser igual al CI ni al correo" },
          { status: 400 }
        );
      }
      // Se confirma contra la contraseña del ADMINISTRADOR que ejecuta el cambio (sea su
      // propia cuenta o la de otro usuario que olvidó su clave).
      const actualPass = (body.passwordActual ?? "").toString();
      let hashVerificador = antes.passwordHash;
      if (sesion?.sub && sesion.sub !== id) {
        const [adminEjecutor] = await db
          .select({ passwordHash: usuarios.passwordHash })
          .from(usuarios)
          .where(eq(usuarios.id, sesion.sub))
          .limit(1);
        if (adminEjecutor) hashVerificador = adminEjecutor.passwordHash;
      }
      if (!actualPass || !(await verifyPasswordAsync(actualPass, hashVerificador))) {
        return NextResponse.json(
          { error: "Debe confirmar su contraseña actual de administrador para cambiarla" },
          { status: 403 }
        );
      }
      patch.passwordHash = await hashPasswordAsync(body.password);
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
      const colision = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(
          and(
            ne(usuarios.id, id),
            or(eq(usuarios.correo, v.correo), v.ci ? eq(usuarios.ci, v.ci) : undefined)
          )
        )
        .limit(1);
      if (colision.length) {
        return NextResponse.json(
          { error: "Ya existe otro usuario con ese correo o cédula", codigo: "DUPLICADO" },
          { status: 409 }
        );
      }
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

    // Si cambió contraseña, rol o dejó de estar activo, se revocan sus sesiones abiertas.
    const cambioSeguridad =
      patch.passwordHash !== undefined ||
      (patch.rol !== undefined && patch.rol !== antes.rol) ||
      (patch.estado !== undefined && patch.estado !== "activo");
    if (cambioSeguridad) {
      await revocarSesionesDeUsuario(id, "Cambio de estado, rol o contraseña por administración");
    }

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

  const sesion = await leerSesionVigente(req);
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