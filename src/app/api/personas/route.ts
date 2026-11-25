import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aFiltroEnum, aValorEnum } from "@/lib/filtros";
import { personas, credencialesPersona } from "@/db/schema";
import { and, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { exigirAdminOKardex, exigirAdminOContacto, verificarCsrf, errorInterno, leerSesionVigente } from "@/lib/guards";
import { registrarCambio } from "@/lib/auditoriaTablas";
import { registrarAuditoria } from "@/lib/auditoria";
import { revocarSesionesDePersona } from "@/lib/sesiones";
import { calcularCambios } from "@/lib/diff";
import { personaAdminSchema, personaAutogestionSchema, primerErrorZod } from "@/lib/validaciones";
import { invalidarCacheDashboard } from "@/lib/cacheDashboard";
import { hashPasswordAsync } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * Módulo 1 de la especificación: REGISTRO ADMINISTRATIVO.
 *
 * Esta ruta antes solo tenía `GET ?ci=` y `PATCH ?ci=`, y ninguna de las dos exigía sesión.
 * No existía forma de registrar a un titular: los datos salían únicamente del `seed`.
 * Ahora:
 *   GET    /api/personas              → listado con filtros, búsqueda y paginación (admin)
 *   GET    /api/personas?ci=...       → ficha puntual (admin o el propio titular)
 *   POST   /api/personas              → ALTA de titulado/egresado (admin)
 *   PATCH  /api/personas?ci=...       → edición del perfil (admin o el propio titular)
 */

const ORDENES: Record<string, any> = {
  nombre: personas.nombresApellidos,
  anio: sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso})`,
  creado: personas.creadoEn,
  actualizado: personas.actualizadoEn,
};

/**
 * GET /api/personas
 *   ?tipo=TITULADO|EGRESADO&sector=...&estado=...&q=busqueda&page=1&perPage=25&orden=nombre
 * Sin `ci` es el LISTADO y requiere admin. Con `ci` es la ficha puntual.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const ci = sp.get("ci");

    // ── Ficha puntual ──────────────────────────────────────────────────────────
    if (ci) {
      const denegado = await exigirAdminOContacto(req, ci);
      if (denegado) return denegado;

      const rows = await db
        .select()
        .from(personas)
        .where(eq(personas.cedulaIdentidad, ci.trim().toUpperCase()))
        .limit(1);

      if (!rows.length)
        return NextResponse.json({ error: "No se encontró el registro" }, { status: 404 });

      // Un registro dado de baja sigue siendo legible (el histórico de acreditación lo
      // necesita), pero el titular no puede iniciar sesión ni editarlo: el código 403
      // con `activo: false` es lo que permite al frontend explicar el bloqueo en vez de
      // mostrar un formulario vacío.
      if (!rows[0]!.activo) {
        const sesion = await leerSesionVigente(req);
        if (sesion?.rol !== "admin" && sesion?.rol !== "KARDEX") {
          return NextResponse.json(
            { error: "Su registro se encuentra dado de baja. Contacte a la Carrera.", activo: false },
            { status: 403 }
          );
        }
      }

      return NextResponse.json(rows[0], {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    const denegado = await exigirAdminOKardex(req);
    if (denegado) return denegado;

    const conds: SQL[] = [];

    // Baja lógica (decisión D3): los registros dados de baja no aparecen en el listado.
    // Se filtran por defecto y solo se incluyen con `?incluirBajas=true`, que es lo que
    // usa la vista de auditoría para ver el histórico.
    const incluirBajas = sp.get("incluirBajas") === "true";
    if (!incluirBajas) conds.push(eq(personas.activo, true), eq(personas.estadoRegistro, "VALIDADO"));

    const tipo = sp.get("tipo");
    if (tipo === "TITULADO" || tipo === "EGRESADO") conds.push(eq(personas.tipo, tipo));

    const sector = sp.get("sector");
    const sectorValido = aFiltroEnum(personas.sectorTrabajo, sector);
    if (sectorValido) conds.push(eq(personas.sectorTrabajo, sectorValido));

    const estado = sp.get("estado");
    const estadoValido = aFiltroEnum(personas.estadoLaboral, estado);
    if (estadoValido) conds.push(eq(personas.estadoLaboral, estadoValido));

    const modalidad = sp.get("modalidad");
    if (modalidad && modalidad !== "TODAS") {
      const modalidadValida = aFiltroEnum(personas.modalidadTitulacion, modalidad, "TODAS");
      if (modalidadValida) conds.push(eq(personas.modalidadTitulacion, modalidadValida));
    }

    const anioMin = sp.get("anioMin");
    if (anioMin)
      conds.push(
        sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) >= ${parseInt(anioMin, 10)}`
      );
    const anioMax = sp.get("anioMax");
    if (anioMax)
      conds.push(
        sql`coalesce(${personas.anioTitulacion}, ${personas.anioEgreso}) <= ${parseInt(anioMax, 10)}`
      );

    // Búsqueda por nombre o CI. Se limita a 80 caracteres y se neutralizan los comodines
    // de ILIKE (`%` y `_`) para que un usuario no pueda provocar un escaneo completo de
    // la tabla ni romper los ILIKE con una secuencia sin escapar. El LIKE se construye
    // con parámetros, así que no hay inyección SQL, pero el comodín sí tenía sentido
    // acotarlo.
    const q = sp.get("q")?.trim().slice(0, 80);
    if (q) {
      const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(
        or(
          ilike(personas.nombresApellidos, patron),
          ilike(personas.cedulaIdentidad, patron)
        )!
      );
    }

    if (sp.get("soloIncompletos") === "true") {
      conds.push(
        sql`(
          ${personas.genero} = 'PREFIERO_NO_DECIR'
          OR ${personas.semestreIngreso} IS NULL OR trim(${personas.semestreIngreso}) = ''
          OR ${personas.semestreEgreso} IS NULL OR trim(${personas.semestreEgreso}) = ''
          OR ${personas.anioEgreso} IS NULL
          OR (${personas.tipo} = 'TITULADO' AND (${personas.anioTitulacion} IS NULL OR ${personas.modalidadTitulacion} IS NULL))
        )`
      );
    }

    const where = conds.length ? and(...conds) : undefined;

    const pagina = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const perPage = Math.min(200, Math.max(5, parseInt(sp.get("perPage") ?? "25", 10) || 25));
    const ordenCol = ORDENES[sp.get("orden") ?? "nombre"] ?? personas.nombresApellidos;
    const direccion = sp.get("dir") === "desc" ? desc(ordenCol) : ordenCol;

    const condIncompleto = sql`(
      ${personas.genero} = 'PREFIERO_NO_DECIR'
      OR ${personas.semestreIngreso} IS NULL OR trim(${personas.semestreIngreso}) = ''
      OR ${personas.semestreEgreso} IS NULL OR trim(${personas.semestreEgreso}) = ''
      OR ${personas.anioEgreso} IS NULL
      OR (${personas.tipo} = 'TITULADO' AND (${personas.anioTitulacion} IS NULL OR ${personas.modalidadTitulacion} IS NULL))
    )`;

    const [[{ total }], filas, resumen] = await Promise.all([
      db.select({ total: count() }).from(personas).where(where),
      db
        .select()
        .from(personas)
        .where(where)
        .orderBy(direccion)
        .limit(perPage)
        .offset((pagina - 1) * perPage),
      db
        .select({
          tipo: personas.tipo,
          n: sql<number>`count(*)::int`,
          empleados: sql<number>`count(*) filter (where ${personas.estadoLaboral} in ('EMPLEADO','INDEPENDIENTE'))::int`,
          incompletos: sql<number>`count(*) filter (where ${condIncompleto})::int`,
        })
        .from(personas)
        .where(where)
        .groupBy(personas.tipo),
    ]);

    return NextResponse.json({
      filas,
      total,
      pagina,
      perPage,
      paginas: Math.max(1, Math.ceil(total / perPage)),
      resumen: {
        titulados: resumen.find((r) => r.tipo === "TITULADO")?.n ?? 0,
        egresados: resumen.find((r) => r.tipo === "EGRESADO")?.n ?? 0,
        empleados: resumen.reduce((a, r) => a + r.empleados, 0),
        incompletos: resumen.reduce((a, r) => a + r.incompletos, 0),
      },
    });
  } catch (e) {
    return errorInterno(e, "api/personas GET");
  }
}

/**
 * POST /api/personas → alta de un titulado o egresado. Solo admin.
 *
 * Valida con zod (incluida la matriz condicional de egresados de `important.md` §1) y
 * rechaza cédulas duplicadas con un mensaje claro, como pide la especificación:
 * "El sistema debe alertar si se intenta registrar una cédula que ya existe".
 */
export async function POST(req: NextRequest) {
  const denegado = await exigirAdminOKardex(req);
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

    const parseo = personaAdminSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: primerErrorZod(parseo.error), campos: parseo.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const datos = parseo.data;

    const ci = datos.cedulaIdentidad.trim().toUpperCase();
    const duplicado = await db
      .select({ id: personas.id, nombre: personas.nombresApellidos })
      .from(personas)
      .where(eq(personas.cedulaIdentidad, ci))
      .limit(1);

    if (duplicado.length) {
      return NextResponse.json(
        {
          error: `La cédula ${ci} ya está registrada a nombre de ${duplicado[0]!.nombre}. La cédula debe ser única.`,
          codigo: "CI_DUPLICADA",
        },
        { status: 409 }
      );
    }

    if (typeof datos.correoElectronico === "string" && datos.correoElectronico.trim() !== "") {
      const correoNorm = datos.correoElectronico.trim().toLowerCase();
      const correoDup = await db
        .select({ id: personas.id })
        .from(personas)
        .where(sql`lower(${personas.correoElectronico}) = ${correoNorm}`)
        .limit(1);
      if (correoDup.length) {
        return NextResponse.json(
          {
            error: "Ese correo electrónico ya está asociado a otro registro.",
            campos: { correoElectronico: ["Correo ya registrado"] },
          },
          { status: 409 }
        );
      }
    }

    // Calcular el tiempo egreso → titulación si vino el año de egreso y el de titulación.
    const tiempoEgresoTitulacionMeses =
      datos.anioEgreso && datos.anioTitulacion
        ? (datos.anioTitulacion - datos.anioEgreso) * 12
        : null;

    const fila = {
      ...datos,
      cedulaIdentidad: ci,
      tiempoEgresoTitulacionMeses:
        tiempoEgresoTitulacionMeses !== null && tiempoEgresoTitulacionMeses >= 0
          ? tiempoEgresoTitulacionMeses
          : datos.tiempoEgresoTitulacionMeses ?? null,
    };

    const [creada] = await db.insert(personas).values(fila).returning();
    const hashInicial = await hashPasswordAsync(ci);
    await db
      .insert(credencialesPersona)
      .values({ idPersona: creada!.id, passwordHash: hashInicial })
      .onConflictDoNothing({ target: credencialesPersona.idPersona });
    invalidarCacheDashboard();

    const sesionAlta = await leerSesionVigente(req);
    await registrarCambio({
      tabla: "audit_personas",
      accion: "crear",
      entidadId: creada!.id,
      idUsuario: sesionAlta?.rol === "admin" || sesionAlta?.rol === "KARDEX" ? sesionAlta.sub : null,
      rol: sesionAlta?.rol ?? null,
      anterior: null,
      nuevo: creada,
      cambios: [],
      req,
    });

    return NextResponse.json(creada, { status: 201 });
  } catch (e) {
    return errorInterno(e, "api/personas POST");
  }
}

export async function PATCH(req: NextRequest) {
  const ci = new URL(req.url).searchParams.get("ci");
  if (!ci) return NextResponse.json({ error: "ci requerido" }, { status: 400 });

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const ciNorm = ci.trim().toUpperCase();

  const denegado = await exigirAdminOContacto(req, ciNorm);
  if (denegado) return denegado;

  const sesion = await leerSesionVigente(req);
  const esAdmin = sesion?.rol === "admin" || sesion?.rol === "KARDEX";

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const actual = await db
      .select()
      .from(personas)
      .where(eq(personas.cedulaIdentidad, ciNorm))
      .limit(1);
    if (!actual.length)
      return NextResponse.json({ error: "No se encontró el registro" }, { status: 404 });

    const anterior = actual[0]!;
    if (!esAdmin && (!anterior.activo || anterior.estadoRegistro !== "VALIDADO")) {
      return NextResponse.json(
        { error: "Su registro no se encuentra habilitado para edición." },
        { status: 403 }
      );
    }

    // Lista blanca estricta de columnas editables (evita Mass Assignment sobre id, consentimiento,
    // baja lógica, supresión o cédula).
    const CAMPOS_ADMIN_EDITABLES = [
      "tipo",
      "nombresApellidos",
      "genero",
      "semestreIngreso",
      "semestreEgreso",
      "anioEgreso",
      "anioTitulacion",
      "modalidadTitulacion",
      "areaEspecializacion",
      "nivelEstudio",
      "realizoCursoUltimos3Anos",
      "ultimoCurso",
      "planeaTitularse",
      "inicioProcesoTitulacion",
      "motivoNoTitulacion",
      "correoElectronico",
      "telefono",
      "redesSociales",
      "ciudadRegionTrabajo",
      "imagenUrl",
      "estadoLaboral",
      "sectorTrabajo",
      "sectorTrabajoOtro",
      "ocupacionCargo",
      "trabajaEnEstadistica",
      "tiempoEgresoTitulacionMeses",
      "tiempoInsercionLaboralMeses",
      "observaciones",
    ];

    const CAMPOS_AUTOGESTION = [
      "correoElectronico",
      "telefono",
      "redesSociales",
      "ciudadRegionTrabajo",
      "estadoLaboral",
      "sectorTrabajo",
      "sectorTrabajoOtro",
      "ocupacionCargo",
      "trabajaEnEstadistica",
      "tiempoInsercionLaboralMeses",
      "observaciones",
      "nivelEstudio",
      "realizoCursoUltimos3Anos",
      "ultimoCurso",
      "planeaTitularse",
      "inicioProcesoTitulacion",
      "motivoNoTitulacion",
    ];

    if (
      esAdmin &&
      body.cedulaIdentidad !== undefined &&
      String(body.cedulaIdentidad).trim().toUpperCase() !== anterior.cedulaIdentidad
    ) {
      return NextResponse.json(
        { error: "La cédula de identidad es inmutable; dé de baja y cree un nuevo registro si requiere corregirla." },
        { status: 400 }
      );
    }

    const listaPermitida = esAdmin ? CAMPOS_ADMIN_EDITABLES : CAMPOS_AUTOGESTION;
    const permitido = listaPermitida.filter((k) => body[k] !== undefined);

    if (!permitido.length)
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });

    const patch: Record<string, unknown> = {};

    if (esAdmin) {
      // Construir objeto base solo con las propiedades que personaAdminSchema conoce
      const baseValidable: Record<string, unknown> = {
        cedulaIdentidad: anterior.cedulaIdentidad,
      };
      for (const k of CAMPOS_ADMIN_EDITABLES) {
        baseValidable[k] = k in body && body[k] !== undefined ? body[k] : anterior[k as keyof typeof anterior];
      }
      const check = personaAdminSchema.safeParse(baseValidable);
      if (!check.success) {
        return NextResponse.json(
          { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const validado = check.data as Record<string, unknown>;
      for (const k of permitido) {
        patch[k] = validado[k] === "" ? null : validado[k];
      }
    } else {
      const soloDinamicos = Object.fromEntries(permitido.map((k) => [k, body[k]]));
      // Si el titular cambia otro campo y ya tenía sector OTRO sin reenviar sectorTrabajoOtro, conservarlo en la validación
      if (soloDinamicos.sectorTrabajo === "OTRO" && soloDinamicos.sectorTrabajoOtro === undefined && anterior.sectorTrabajoOtro) {
        soloDinamicos.sectorTrabajoOtro = anterior.sectorTrabajoOtro;
      }
      const check = personaAutogestionSchema.safeParse(soloDinamicos);
      if (!check.success) {
        return NextResponse.json(
          { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const validado = check.data as Record<string, unknown>;
      for (const k of permitido) {
        patch[k] = validado[k] === "" ? null : validado[k];
      }
    }

    // Evitar correos duplicados entre titulares (impediría el login por correo).
    if (typeof patch.correoElectronico === "string" && patch.correoElectronico.trim() !== "") {
      const correoNorm = patch.correoElectronico.trim().toLowerCase();
      patch.correoElectronico = correoNorm;
      const correoDuplicado = await db
        .select({ id: personas.id })
        .from(personas)
        .where(and(sql`lower(${personas.correoElectronico}) = ${correoNorm}`, ne(personas.id, anterior.id)))
        .limit(1);
      if (correoDuplicado.length) {
        return NextResponse.json(
          {
            error: "Ese correo electrónico ya está asociado a otro registro.",
            campos: { correoElectronico: ["Correo ya registrado"] },
          },
          { status: 409 }
        );
      }
    }

    // Coherencia del sector "Otro" SOLO cuando `sectorTrabajo` fue modificado o enviado
    if (patch.sectorTrabajo !== undefined) {
      if (patch.sectorTrabajo !== "OTRO") {
        patch.sectorTrabajoOtro = null;
      } else if (!patch.sectorTrabajoOtro) {
        patch.sectorTrabajoOtro = anterior.sectorTrabajoOtro ?? null;
      }
    }

    // Solo los egresados pueden tener los campos de titulación.
    const tipoEfectivo = (patch.tipo as string | undefined) ?? anterior.tipo;
    if (tipoEfectivo === "TITULADO") {
      patch.planeaTitularse = null;
      patch.inicioProcesoTitulacion = null;
      patch.motivoNoTitulacion = null;
    }

    // Recalcular el tiempo egreso → titulación si cambian los años.
    const anioEgreso = patch.anioEgreso !== undefined ? patch.anioEgreso : anterior.anioEgreso;
    const anioTitulacion = patch.anioTitulacion !== undefined ? patch.anioTitulacion : anterior.anioTitulacion;
    const nEgreso = anioEgreso == null ? NaN : Number(anioEgreso);
    const nTitulacion = anioTitulacion == null ? NaN : Number(anioTitulacion);
    if (Number.isFinite(nEgreso) && Number.isFinite(nTitulacion) && nTitulacion >= nEgreso) {
      patch.tiempoEgresoTitulacionMeses = (nTitulacion - nEgreso) * 12;
    }

    patch.actualizadoEn = new Date();

    const [actualizada] = await db
      .update(personas)
      .set(patch as Record<string, unknown>)
      .where(eq(personas.cedulaIdentidad, ciNorm))
      .returning();
    invalidarCacheDashboard();

    await registrarCambio({
      tabla: "audit_personas",
      accion: "editar",
      entidadId: anterior.id,
      idUsuario: esAdmin ? sesion?.sub ?? null : null,
      rol: sesion?.rol ?? null,
      anterior,
      nuevo: actualizada,
      cambios: calcularCambios(anterior as Record<string, unknown>, actualizada as Record<string, unknown>),
      req,
    });

    return NextResponse.json(actualizada);
  } catch (e) {
    return errorInterno(e, "api/personas PATCH");
  }
}

/**
 * DELETE /api/personas → baja lógica masiva de registros seleccionados.
 * Acepta `{ ids: number[], motivo: string }`. Protegido para admin y KARDEX.
 */
export async function DELETE(req: NextRequest) {
  const denegado = await exigirAdminOKardex(req);
  if (denegado) return denegado;

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const sesion = await leerSesionVigente(req);

  try {
    let body: { ids?: unknown; motivo?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: "Debe seleccionar al menos un registro para dar de baja" },
        { status: 400 }
      );
    }

    const idsInvalidos = body.ids.some((x) => typeof x !== "number" || !Number.isInteger(x) || x <= 0);
    if (idsInvalidos) {
      return NextResponse.json(
        { error: "Los identificadores seleccionados no son válidos" },
        { status: 400 }
      );
    }

    const idsUnicos = Array.from(new Set(body.ids as number[]));
    if (idsUnicos.length === 0 || idsUnicos.length > 200) {
      return NextResponse.json(
        { error: "Puede dar de baja entre 1 y 200 registros a la vez" },
        { status: 400 }
      );
    }

    const motivoLimpio = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";
    if (motivoLimpio.length < 3) {
      return NextResponse.json(
        { error: "Debe indicar el motivo de la baja (mínimo 3 caracteres)" },
        { status: 400 }
      );
    }

    const activas = await db
      .select({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
      })
      .from(personas)
      .where(and(inArray(personas.id, idsUnicos), eq(personas.activo, true)));

    if (!activas.length) {
      return NextResponse.json(
        { error: "No se encontraron registros activos para dar de baja" },
        { status: 404 }
      );
    }

    const idsAfectar = activas.map((p) => p.id);
    const idAdmin = sesion?.rol === "admin" || sesion?.rol === "KARDEX" ? sesion.sub : null;
    const ahora = new Date();

    const afectadas = await db
      .update(personas)
      .set({
        activo: false,
        eliminadoEn: ahora,
        eliminadoPor: idAdmin,
        motivoBaja: motivoLimpio,
        actualizadoEn: ahora,
      })
      .where(and(inArray(personas.id, idsAfectar), eq(personas.activo, true)))
      .returning({
        id: personas.id,
        nombresApellidos: personas.nombresApellidos,
        cedulaIdentidad: personas.cedulaIdentidad,
      });

    await Promise.all(
      afectadas.map((p) => revocarSesionesDePersona(p.id, "Baja lógica masiva del registro"))
    );

    invalidarCacheDashboard();

    const resumenNombres = afectadas
      .slice(0, 10)
      .map((p) => `${p.nombresApellidos} (${p.cedulaIdentidad})`)
      .join(", ");

    await registrarAuditoria({
      accion: "eliminar",
      entidad: "personas",
      entidadId: afectadas[0]?.id ?? null,
      idUsuario: idAdmin,
      detalles: `Baja lógica masiva (${afectadas.length} registros): ${resumenNombres}${afectadas.length > 10 ? "…" : ""} · motivo: ${motivoLimpio}`,
      datosAnteriores: { activo: true, ids: afectadas.map((p) => p.id) },
      datosNuevos: {
        activo: false,
        cantidad: afectadas.length,
        ids: afectadas.map((p) => p.id),
        motivoBaja: motivoLimpio,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      eliminados: afectadas.length,
      ids: afectadas.map((p) => p.id),
    });
  } catch (e) {
    return errorInterno(e, "api/personas DELETE");
  }
}