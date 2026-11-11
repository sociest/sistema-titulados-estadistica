import { NextRequest, NextResponse } from "next/server";
import { db, pool } from "@/db";
import { personas, solicitudTituladoHistorial, carreras, credencialesPersona, sesiones } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { exigirAdminOContacto, errorInterno, leerSesionVigente, verificarCsrf } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { supresionDatosSchema, primerErrorZod } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * GET /api/mis-datos  (titular o admin)
 *
 * Derecho de acceso y portabilidad (ISO/IEC 27701:2025, gestión de los derechos de los
 * titulares; Ley 1405 art. 11 y ss. — derechos de acceso, rectificación, cancelación y
 * oposición).
 *
 * Devuelve una copia de TODOS los datos personales que el sistema tiene sobre la
 * persona, en formato estructurado y legible por máquina (JSON), no un recorte de los
 * campos "bonitos". Un derecho de acceso mal implementado —que solo devuelve lo que la
 * interfaz muestra— no cumple: la persona tiene derecho a conocer también los datos
 * derivados, los metadatos de registro y el histórico administrativo que le concierne.
 *
 * Se incluye deliberadamente `consentimiento_*`: es dato sobre el tratamiento de sus
 * datos, y la Ley 1405 art. 8 obliga a informar sobre la existencia del tratamiento.
 *
 * `suprimir` ? De eso se encarga el endpoint hermano con `DELETE`.
 *
 * Se registra en `audit_log` con acción propia: el acceso a datos por parte del
 * titular debe ser trazable, igual que el acceso del administrador.
 */
export async function GET(req: NextRequest) {
  const sesion = await leerSesionVigente(req);
  if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });

  // El rol "KARDEX" (y cualquier rol sin ficha de persona asociada) no tiene derecho
  // de acceso/portabilidad porque no es titular de un registro. Se devuelve 403 y no
  // 400, para distinguirlo de una petición mal formada.
  // Si es administrador sin ?ci= tampoco procede (el admin no tiene ficha propia en personas).
  const { searchParams } = new URL(req.url);
  const ciParam = searchParams.get("ci");
  if (sesion.rol === "admin" && !ciParam) {
    return NextResponse.json(
      { error: "El administrador debe especificar la cédula del titular (?ci=)" },
      { status: 403 }
    );
  }

  const ROLES_CON_FICHA = ["TITULADO", "EGRESADO", "admin"];
  if (!ROLES_CON_FICHA.includes(sesion.rol)) {
    return NextResponse.json(
      { error: "Este rol no tiene asociada una ficha de datos personales" },
      { status: 403 }
    );
  }

  try {
    const ciSolicitada = (ciParam ?? sesion.ci ?? "").trim().toUpperCase();
    const ciSesion = (sesion.ci ?? "").trim().toUpperCase();

    // El admin puede pedir la portabilidad de cualquiera; el titular solo la suya.
    if (sesion.rol !== "admin" && ciSolicitada !== ciSesion) {
      await registrarAuditoria({
        accion: "consultar_datos",
        entidad: "personas",
        idUsuario: sesion.sub,
        detalles: `Intento de portabilidad sobre otra ficha (CI pedida: ${ciSolicitada})`,
        req,
      });
      return NextResponse.json(
        { error: "No tiene permisos sobre este registro" },
        { status: 403 }
      );
    }

    if (!ciSolicitada) {
      return NextResponse.json({ error: "Falta la cédula de identidad" }, { status: 400 });
    }

    const [persona] = await db
      .select()
      .from(personas)
      .where(sql`upper(${personas.cedulaIdentidad}) = ${ciSolicitada}`)
      .limit(1);

    if (!persona) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    // Grados y datos universitarios asociados, que viven en otra tabla.
    const grados = await db.select().from(carreras).where(eq(carreras.ci, ciSolicitada));

    // Histórico administrativo: qué le pasó a su solicitud y quién lo decidió.
    const historial = await db
      .select()
      .from(solicitudTituladoHistorial)
      .where(sql`upper(${solicitudTituladoHistorial.ci}) = ${ciSolicitada}`)
      .orderBy(sql`${solicitudTituladoHistorial.fecha} desc`);

    await registrarAuditoria({
      accion: "consultar_datos",
      entidad: "personas",
      entidadId: persona.id,
      idUsuario: sesion.sub,
      detalles: `Portabilidad solicitada sobre CI ${ciSolicitada}`,
      req,
    });

    return NextResponse.json(
      {
        metadatos: {
          generadoEn: new Date().toISOString(),
          generadoPor: sesion.rol === "admin" ? "administrador" : "titular",
          versionAvisoPrivacidad: persona.consentimientoVersion,
          aviso:
            "Documento de portabilidad de datos. Contiene información personal; " +
            "trátelo como confidencial.",
        },
        persona,
        grados,
        historialSolicitudes: historial,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return errorInterno(e, "api/mis-datos GET");
  }
}

/**
 * DELETE /api/mis-datos?ci=…  (titular o admin)
 *
 * Derecho de supresión / cancelación (Ley 1405 art. 13; GDPR art. 17).
 *
 * La base es el registro institucional de titulados y egresados y alimenta las
 * estadísticas de empleabilidad que sustentan la acreditación. Borrar la fila
 * destruiría indicadores históricos que la Carrera necesita conservar, y ese es el
 * motivo legítimo que permite anular el dato conservando el agregado.
 *
 * La solución aplicada es la SEUDONIMIZACIÓN (dato anonimizado): se conservan solo los
 * atributos estrictamente necesarios para que el agregado siga siendo correcto (el tipo
 * de persona y los años de egreso/titulación) y se elimina todo lo que identifica —
 * nombre, cédula, género, contacto, ubicación, situación laboral y notas. Un agregado
 * estadístico no identifica a nadie.
 *
 * Además se borran las credenciales (hash de contraseña) y las sesiones activas de la
 * persona, y se anonimiza la cédula de identidad.
 *
 * Lo que NO se puede hacer, y por eso esta operación queda registrada en el log
 * encadenado e inmutable: el borrado silencioso. Que conste quién pidió la supresión y
 * cuándo es lo que permite demostrar que el derecho se ejerció.
 *
 * La fila pasa a `activo=false`, igual que la baja administrativa (decisión D3), para
 * que desaparezca de los listados y de las métricas.
 */
export async function DELETE(req: NextRequest) {
  const sesion = await leerSesionVigente(req);
  if (!sesion) return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });

  // El rol "KARDEX" no tiene ficha de persona asociada; no puede ejercer el derecho
  // de supresión porque no hay datos suyos que suprimir.
  const { searchParams } = new URL(req.url);
  const ciParam = searchParams.get("ci");
  if (sesion.rol === "admin" && !ciParam) {
    return NextResponse.json(
      { error: "El administrador debe especificar la cédula del titular (?ci=)" },
      { status: 403 }
    );
  }

  const ROLES_CON_FICHA = ["TITULADO", "EGRESADO", "admin"];
  if (!ROLES_CON_FICHA.includes(sesion.rol)) {
    return NextResponse.json(
      { error: "Este rol no tiene asociada una ficha de datos personales" },
      { status: 403 }
    );
  }

  const denegadoCsrf = await verificarCsrf(req);
  if (denegadoCsrf) return denegadoCsrf;

  const cliente = await pool.connect();
  try {
    const ciSolicitada = (ciParam ?? sesion.ci ?? "").trim().toUpperCase();
    const ciSesion = (sesion.ci ?? "").trim().toUpperCase();

    if (sesion.rol !== "admin" && ciSolicitada !== ciSesion) {
      await registrarAuditoria({
        accion: "suprimir_datos",
        entidad: "personas",
        idUsuario: sesion.sub,
        detalles: `Intento de supresión sobre otra ficha (CI pedida: ${ciSolicitada})`,
        req,
      });
      return NextResponse.json(
        { error: "No tiene permisos sobre este registro" },
        { status: 403 }
      );
    }

    if (!ciSolicitada) {
      return NextResponse.json({ error: "Falta la cédula de identidad" }, { status: 400 });
    }

    // Un cuerpo vacío o mal formado se rechaza con 400: antes se pasaba a "motivo vacío"
    // y la supresión seguía adelante, con un motivo que no explicaba nada.
    let motivo: string;
    try {
      const crudo: unknown = await req.json();
      const check = supresionDatosSchema.safeParse(crudo);
      if (!check.success) {
        return NextResponse.json(
          { error: primerErrorZod(check.error), campos: check.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      motivo = check.data.motivo;
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    await cliente.query("BEGIN");

    const encontrado = await cliente.query<{ id: number }>(
      `SELECT id FROM personas WHERE upper(cedula_identidad) = $1 FOR UPDATE`,
      [ciSolicitada]
    );
    const personaId = encontrado.rows[0]?.id;
    if (!personaId) {
      await cliente.query("ROLLBACK");
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const ahora = new Date();

    // Anonimización completa + baja lógica, en la misma transacción.
    await cliente.query(
      `UPDATE personas SET
         nombres_apellidos        = 'DATO SUPRIMIDO',
         cedula_identidad         = NULL,
         correo_electronico       = NULL,
         telefono                 = NULL,
         redes_sociales           = NULL,
         ciudad_region_trabajo    = NULL,
         genero                   = 'PREFIERO_NO_DECIR',
         ocupacion_cargo          = NULL,
         observaciones            = NULL,
         area_especializacion     = NULL,
         ultimo_curso             = NULL,
         realizo_curso_ultimos_3_anios = NULL,
         nivelestudio             = NULL,
         sector_trabajo_otro      = NULL,
         tiempo_egreso_titulacion_meses = NULL,
         tiempo_insercion_laboral_meses = NULL,
         -- Se conservan tipo, semestre/año de ingreso y egreso, y los años de
         -- titulación: son los atributos sin los que los agregados por cohorte y por
         -- año dejan de ser correctos. No identifican a nadie por sí solos.
         consentimiento_otorgado   = false,
         consentimiento_otorgado_en = NULL,
         consentimiento_version   = NULL,
         consentimiento_ip        = NULL,
         supresion_solicitada_en  = $2,
         supresion_completada_en  = $2,
         supresion_motivo         = $3,
         motivo_baja              = 'Supresión solicitada por el titular',
         activo                   = false,
         estado_registro          = 'RECHAZADO',
         actualizado_en           = $2
       WHERE id = $1`,
      [personaId, ahora, motivo || "Solicitud del titular"]
    );

    // Borrar credenciales (hash de contraseña) de la persona.
    await cliente.query(
      `DELETE FROM credenciales_persona WHERE id_persona = $1`,
      [personaId]
    );

    // Revocar todas las sesiones activas de la persona.
    await cliente.query(
      `UPDATE sesiones SET revocada_en = $2, motivo_revocacion = $3 WHERE id_persona = $1 AND revocada_en IS NULL`,
      [personaId, ahora, "Supresión de datos del titular"]
    );

    await cliente.query("COMMIT");

    await registrarAuditoria({
      accion: "suprimir_datos",
      entidad: "personas",
      entidadId: personaId,
      idUsuario: sesion.sub,
      detalles:
        `Supresión de datos ejecutada sobre CI ${ciSolicitada} · ` +
        `solicitada por ${sesion.rol === "admin" ? "administrador" : "el titular"} · ` +
        `motivo: ${motivo || "no indicado"}`,
      req,
    });

    return NextResponse.json({
      mensaje:
        "Sus datos personales fueron suprimidos. Se conservaron únicamente los datos " +
        "necesarios para las estadísticas agregadas, que no permiten identificarle.",
      fecha: ahora.toISOString(),
    });
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    return errorInterno(e, "api/mis-datos DELETE");
  } finally {
    cliente.release();
  }
}
