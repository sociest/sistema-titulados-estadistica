import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aFiltroEnum, aValorEnum } from "@/lib/filtros";
import { personas } from "@/db/schema";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { exigirAdmin, exigirAdminOContacto, verificarCsrf, errorInterno } from "@/lib/guards";
import { leerSesionDeRequest } from "@/lib/sesion";
import { registrarCambio } from "@/lib/auditoriaTablas";
import { calcularCambios } from "@/lib/diff";
import { personaAdminSchema, personaAutogestionSchema, primerErrorZod } from "@/lib/validaciones";

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
        const sesion = await leerSesionDeRequest(req);
        if (sesion?.rol !== "admin") {
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

    // ── Listado (solo admin) ──────────────────────────────────────────────────
    const denegado = await exigirAdmin(req);
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
    if (modalidad && modalidad !== "TODAS")
      conds.push(eq(personas.modalidadTitulacion, aFiltroEnum(personas.modalidadTitulacion, modalidad, "TODAS")!));

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

    const where = conds.length ? and(...conds) : undefined;

    const pagina = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const perPage = Math.min(200, Math.max(5, parseInt(sp.get("perPage") ?? "25", 10) || 25));
    const ordenCol = ORDENES[sp.get("orden") ?? "nombre"] ?? personas.nombresApellidos;
    const direccion = sp.get("dir") === "desc" ? desc(ordenCol) : ordenCol;

    const [{ total }] = await db.select({ total: count() }).from(personas).where(where);

    const filas = await db
      .select()
      .from(personas)
      .where(where)
      .orderBy(direccion)
      .limit(perPage)
      .offset((pagina - 1) * perPage);

    // Totales por tipo, para las pestañas del panel. Cuentan los mismos registros que
    // el listado: si no, las pestañas mostrarían un total que la tabla no tiene.
    const resumen = await db
      .select({
        tipo: personas.tipo,
        n: sql<number>`count(*)::int`,
        empleados: sql<number>`count(*) filter (where ${personas.estadoLaboral} in ('EMPLEADO','INDEPENDIENTE'))::int`,
      })
      .from(personas)
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(personas.tipo);

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

    const parseo = personaAdminSchema.safeParse(body);
    if (!parseo.success) {
      return NextResponse.json(
        { error: primerErrorZod(parseo.error), campos: parseo.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const datos = parseo.data;

    // Cédula única e irrepetible
    const ci = datos.cedulaIdentidad.trim().toUpperCase();
    const duplicado = await db
      .select({ id: personas.id, nombre: personas.nombresApellidos })
      .from(personas)
      .where(sql`upper(${personas.cedulaIdentidad}) = ${ci}`)
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

    const sesionAlta = await leerSesionDeRequest(req);
    await registrarCambio({
      tabla: "audit_personas",
      accion: "crear",
      entidadId: creada!.id,
      idUsuario: sesionAlta?.sub ?? null,
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

/**
 * PATCH /api/personas?ci=...
 *
 * El admin puede editar TODO, incluidos los campos "K" de Kardex (inmutables para el
 * titular). El titulado/egresado solo puede editar los campos dinámicos de su perfil.
 */
export async function PATCH(req: NextRequest) {
  const ci = new URL(req.url).searchParams.get("ci");
  if (!ci) return NextResponse.json({ error: "ci requerido" }, { status: 400 });

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const ciNorm = ci.trim().toUpperCase();

  const denegado = await exigirAdminOContacto(req, ciNorm);
  if (denegado) return denegado;

  const sesion = await leerSesionDeRequest(req);
  const esAdmin = sesion?.rol === "admin";

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

    /**
     * Consentimiento acceptance (auto-fill, server-controlled). Only set on the
     * self-service branch and never comes from the request body as a mutable value:
     * the server stamps the date and records the accepted text version.
     */

    // El titular no puede tocar campos K ni cambiar su tipo.
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

    const permitido = esAdmin
      ? Object.keys(body)
      : CAMPOS_AUTOGESTION.filter((k) => body[k] !== undefined);

    const descartados = Object.keys(body).filter((k) => !permitido.includes(k));
    if (descartados.length && !esAdmin) {
      console.warn(`[api/personas] campos ignorados (no editables por el titular): ${descartados}`);
    }

    if (!permitido.length)
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });

    // Validar el objeto resultante con el esquema correspondiente.
    if (esAdmin) {
      // Para el admin se valida el objeto completo (anterior + cambios), lo que también
      // comprueba la matriz condicional de egresados.
      const combinado = {
        ...anterior,
        ...Object.fromEntries(permitido.map((k) => [k, body[k]])),
      };
      const check = personaAdminSchema.safeParse(combinado);
      if (!check.success) {
        return NextResponse.json(
          { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
    } else {
      // Para el titular: esquema estricto sobre SOLO los campos permitidos. Si se envió
      // algún campo de Kardex, `permitido` ya lo eliminó, así que aquí se valida el perfil
      // dinámico completo y se descarta lo que no cuadre.
      const soloDinamicos = {
        ...Object.fromEntries(
          CAMPOS_AUTOGESTION.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])
        ),
      };
      if (Object.keys(soloDinamicos).length) {
        const check = personaAutogestionSchema.safeParse(soloDinamicos);
        if (!check.success) {
          return NextResponse.json(
            { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
            { status: 400 }
          );
        }
      }

    }

    const patch: Record<string, unknown> = {};
    for (const k of permitido) {
      const v = body[k];
      if (v === undefined) continue;
      patch[k] = v === "" ? null : v;
    }

    if (patch.trabajaEnEstadistica !== undefined) {
      patch.trabajaEnEstadistica =
        patch.trabajaEnEstadistica === true ||
        patch.trabajaEnEstadistica === "true" ||
        patch.trabajaEnEstadistica === "SI";
    }
    if (patch.tiempoInsercionLaboralMeses !== undefined && patch.tiempoInsercionLaboralMeses !== null) {
      const n = parseInt(String(patch.tiempoInsercionLaboralMeses), 10);
      patch.tiempoInsercionLaboralMeses = Number.isFinite(n) && n >= 0 ? n : null;
    }

    // Coherencia del sector "Otro"
    if (patch.sectorTrabajo !== "OTRO") patch.sectorTrabajoOtro = null;
    if (patch.sectorTrabajo === "OTRO" && !patch.sectorTrabajoOtro) {
      patch.sectorTrabajoOtro = actual[0]!.sectorTrabajoOtro ?? null;
    }

    // Solo los egresados pueden tener los campos de titulación.
    if (anterior.tipo === "TITULADO") {
      patch.planeaTitularse = null;
      patch.inicioProcesoTitulacion = null;
      patch.motivoNoTitulacion = null;
    }

    // Recalcular el tiempo egreso → titulación si cambian los años.
    const anioEgreso = patch.anioEgreso ?? anterior.anioEgreso;
    const anioTitulacion = patch.anioTitulacion ?? anterior.anioTitulacion;
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

    const cambios = permitido.filter(
      (k) => JSON.stringify(anterior[k as keyof typeof anterior]) !== JSON.stringify(actualizada![k as keyof typeof actualizada])
    );

    await registrarCambio({
      tabla: "audit_personas",
      accion: "editar",
      entidadId: anterior.id,
      idUsuario: sesion?.sub ?? null,
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