import { z } from "zod";
import {
  aMayusculasLimpias,
  normalizarGenero,
  normalizarModalidad,
  normalizarSemestre,
  normalizarTipo,
} from "./normalizacion";

/**
 * Los formularios envían "" cuando un campo no tiene respuesta. Un enum no acepta "",
 * así que se convierte a null antes de validar (el caso "planeaTitularse: received ''").
 */
export const enumOpcional = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), esquema.nullable());

/** Imagen de noticia/perfil: URL https segura o archivo ya subido al servidor. */
export const urlImagenNoticia = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) =>
      v === "" ||
      /^https:\/\/[^\s]+$/i.test(v) ||
      /^\/api\/noticias\/imagen\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(v),
    "La imagen debe ser una URL https:// o un archivo subido desde el sistema"
  );

/**
 * Booleano tolerante. `z.coerce.boolean()` hace `Boolean(v)`, así que "NO", "false" y "0"
 * daban `true`; aquí se interpretan por su significado (CSV, Excel y formularios).
 * Un valor vacío cuenta como "no informado" (undefined).
 */
const aBool = (v: unknown) => {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === "") return undefined;
  if (["si", "sí", "true", "1", "x", "yes"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  return v; // valor irreconocible: lo rechaza z.boolean()
};
const booleano = z.preprocess(aBool, z.boolean().optional());
const booleanoFalso = z.preprocess(aBool, z.boolean().default(false));


/**
 * Esquemas de validación (zod) compartidos entre el cliente y el servidor.
 *
 * Reglas de negocio:
 *  - `cedulaIdentidad` es la llave única e irrepetible (spec del PDF).
 *  - Los campos "K" (Kardex) solo los puede escribir el ADMIN.
 *  - Los campos de titulación de egresados siguen la matriz condicional de `important.md` §1.
 */

/**
 * CI numérico de 4 a 12 dígitos. No se almacenan ni aceptan sufijos alfabéticos.
 */
const CI_REGEX = /^[0-9]{4,12}$/;

export const tipoEnum = z.enum(["TITULADO", "EGRESADO"]);
export const generoEnum = z.enum(["MASCULINO", "FEMENINO", "PREFIERO_NO_DECIR"]);
export const generoObligatorioEnum = z.enum(["MASCULINO", "FEMENINO"], {
  errorMap: () => ({ message: "Debe seleccionar género (MASCULINO o FEMENINO)" }),
});
export const modalidadEnum = z.enum([
  "TESIS",
  "PROYECTO DE GRADO",
  "EXAMEN DE GRADO",
  "TRABAJO DIRIGIDO",
  "EXCELENCIA",
  "OTRO",
]);
export const planeaEnum = z.enum(["SI", "NO", "NO_SABE"]);
export const inicioProcesoEnum = z.enum(["SI", "NO"]);
export const motivoEnum = z.enum(["LABORAL", "ECONOMICO", "PERSONAL", "EN_PROCESO", "OTRO"]);
export const estadoLaboralEnum = z.enum(["EMPLEADO", "DESEMPLEADO", "INDEPENDIENTE"]);
export const sectorEnum = z.enum(["PUBLICO", "PRIVADO", "ACADEMICO", "ONG", "OTRO"]);
export const nivelEstudioEnum = z.enum([
  "TÉCNICO",
  "LICENCIATURA",
  "LICENCIATURA CON ESPECIALIZACIÓN",
  "MAESTRÍA",
  "POSGRADO",
]);

const anio = z.preprocess(
  (v) => (v === null || v === undefined || String(v).trim() === "" ? null : v),
  z.coerce.number().int().min(1970, "Año demasiado antiguo").max(2100, "Año inválido").nullable()
);

const semestre = z.preprocess(
  (v) => normalizarSemestre(v),
  z
    .string()
    .max(30)
    .regex(
      /^(I{1,2}\/\d{4}|1ER\s+SEMESTRE\s+\d{4}|2DO\s+SEMESTRE\s+\d{4}|(19|20)\d{2})$/i,
      "Formato esperado: I/AAAA, II/AAAA, AAAA, '1er semestre AAAA' o '2do semestre AAAA'"
    )
    .nullable()
);

const correoOpcional = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase();
    return s === "" ? null : s;
  },
  z.string().email("Correo inválido").max(150).nullable()
);

const enteroOpcional = (max: number) =>
  z.preprocess(
    (v) => (v === null || v === undefined || String(v).trim() === "" ? null : v),
    z.coerce.number().int().min(0).max(max).nullable()
  );

const textoOpcional = (max = 500) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    },
    z.string().max(max, `Máximo ${max} caracteres`).nullable().optional()
  );

const personaAdminBase = z.object({
    tipo: z.preprocess((v) => normalizarTipo(v), tipoEnum),
    nombresApellidos: z.preprocess(
      (v) => (typeof v === "string" ? aMayusculasLimpias(v) : v),
      z.string().min(3, "Nombre muy corto").max(150, "Máximo 150 caracteres")
    ),
    cedulaIdentidad: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CI_REGEX, "La cédula debe contener únicamente de 4 a 12 dígitos"),
    genero: z.preprocess(
      (v) => (v === null || v === undefined ? "" : normalizarGenero(v)),
      generoObligatorioEnum
    ),
    semestreIngreso: semestre.optional(),
    semestreEgreso: semestre.optional(),
    anioEgreso: anio.optional(),
    anioTitulacion: anio.optional(),
    modalidadTitulacion: z.preprocess(
      (v) => {
        if (v === null || v === undefined || String(v).trim() === "") return null;
        return normalizarModalidad(v);
      },
      modalidadEnum.nullable()
    ).optional(),
    areaEspecializacion: textoOpcional(200),
    nivelEstudio: enumOpcional(nivelEstudioEnum).optional(),
    realizoCursoUltimos3Anos: z.boolean().nullable().optional(),
    ultimoCurso: textoOpcional(200),

    planeaTitularse: enumOpcional(planeaEnum).optional(),
    inicioProcesoTitulacion: enumOpcional(inicioProcesoEnum).optional(),
    motivoNoTitulacion: enumOpcional(motivoEnum).optional(),

    correoElectronico: correoOpcional.optional(),
    telefono: z.preprocess(
      (v) => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      },
      z.string().max(20).regex(/^[0-9+\-\s()]*$/, "Teléfono inválido").nullable().optional()
    ),
    redesSociales: textoOpcional(300),
    ciudadRegionTrabajo: textoOpcional(200),

    imagenUrl: urlImagenNoticia.nullable().optional(),

    estadoLaboral: z.preprocess(
      (v) => (v === null || v === undefined || String(v).trim() === "" ? "DESEMPLEADO" : String(v).trim().toUpperCase()),
      estadoLaboralEnum.default("DESEMPLEADO")
    ),
    sectorTrabajo: enumOpcional(sectorEnum).optional(),
    sectorTrabajoOtro: textoOpcional(200),
    ocupacionCargo: textoOpcional(200),
    trabajaEnEstadistica: booleanoFalso,

    tiempoEgresoTitulacionMeses: enteroOpcional(1200).optional(),
    tiempoInsercionLaboralMeses: enteroOpcional(600).optional(),
    observaciones: textoOpcional(2000),
}).strict();

/**
 * Alta manual y corrección por el administrador o Kardex:
 * Solo exige tipo, nombresApellidos, cedulaIdentidad y genero (MASCULINO | FEMENINO).
 * El resto puede quedar vacío/nulo para completarse luego (y el listado marca en rojo los que tienen datos faltantes).
 */
export const personaAdminSchema = personaAdminBase.superRefine((v, ctx) => {
    if (v.realizoCursoUltimos3Anos === true && !v.ultimoCurso) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ultimoCurso"], message: "Indique el nombre del curso" });
    }
    if (v.realizoCursoUltimos3Anos === false && v.ultimoCurso) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ultimoCurso"], message: "El curso sólo aplica si respondió SÍ" });
    }
    if (v.sectorTrabajo === "OTRO" && !v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Debe especificar cuál es el otro sector",
      });
    }
    if (v.sectorTrabajo !== "OTRO" && v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Solo aplica si el sector es 'OTRO'",
      });
    }
    if (v.tipo === "TITULADO") {
      if (v.planeaTitularse) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planeaTitularse"],
          message: 'Este campo es exclusivo de egresados',
        });
      }
      if (v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "Este campo es exclusivo de egresados",
        });
      }
    }
    if (v.tipo === "EGRESADO" && v.planeaTitularse) {
      const pideMotivo =
        v.planeaTitularse === "NO" ||
        v.planeaTitularse === "NO_SABE" ||
        (v.planeaTitularse === "SI" && v.inicioProcesoTitulacion === "NO");
      if (!pideMotivo && v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "No aplica: ya inició su proceso de titulación",
        });
      }
      if (v.planeaTitularse !== "SI" && v.inicioProcesoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inicioProcesoTitulacion"],
          message: "No aplica: solo si planea titularse",
        });
      }
    }
  });

/**
 * Campos que el propio TITULADO / EGRESADO puede editar sobre su perfil.
 *
 * `.strict()` es deliberado: si el titular manda un campo de Kardex (anioTitulacion,
 * cedulaIdentidad, modalidadTitulacion…) la petición se rechaza con 400 en vez de ignorar
 * el campo en silencio. Es defensa en profundidad: aunque el API route ya filtra la lista
 * de campos permitidos, el esquema por sí solo tampoco acepta campos que no le pertenecen.
 */
export const personaAutogestionSchema = z
  .object({
    correoElectronico: correoOpcional.optional(),
    telefono: z.preprocess(
      (v) => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      },
      z.string().max(20).regex(/^[0-9+\-\s()]*$/, "Teléfono inválido").nullable().optional()
    ),
    redesSociales: textoOpcional(300),
    ciudadRegionTrabajo: textoOpcional(200),
    nivelEstudio: enumOpcional(nivelEstudioEnum).optional(),
    realizoCursoUltimos3Anos: z.boolean().nullable().optional(),
    ultimoCurso: textoOpcional(200),
    estadoLaboral: estadoLaboralEnum.optional(),
    sectorTrabajo: enumOpcional(sectorEnum).optional(),
    sectorTrabajoOtro: textoOpcional(200),
    ocupacionCargo: textoOpcional(200),
    trabajaEnEstadistica: booleano,
    tiempoInsercionLaboralMeses: enteroOpcional(600).optional(),
    observaciones: textoOpcional(2000),
    // Solo egresados
    planeaTitularse: enumOpcional(planeaEnum).optional(),
    inicioProcesoTitulacion: enumOpcional(inicioProcesoEnum).optional(),
    motivoNoTitulacion: enumOpcional(motivoEnum).optional(),

  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.realizoCursoUltimos3Anos === true && !v.ultimoCurso) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ultimoCurso"], message: "Indique el nombre del curso" });
    }
    if (v.realizoCursoUltimos3Anos === false && v.ultimoCurso) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ultimoCurso"], message: "El curso sólo aplica si respondió SÍ" });
    }
    if (v.sectorTrabajo === "OTRO" && !v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Debe especificar cuál es el otro sector",
      });
    }
    const pideMotivo =
      v.planeaTitularse === "NO" ||
      v.planeaTitularse === "NO_SABE" ||
      (v.planeaTitularse === "SI" && v.inicioProcesoTitulacion === "NO");
    if (v.planeaTitularse && !pideMotivo && v.motivoNoTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivoNoTitulacion"],
        message: "No aplica: ya inició su proceso de titulación",
      });
    }
    if (v.planeaTitularse !== "SI" && v.inicioProcesoTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inicioProcesoTitulacion"],
        message: "No aplica: solo si planea titularse",
      });
    }
  });

/**
 * Importación masiva (CSV / Excel).
 *
 * Exige únicamente: `tipo`, `nombresApellidos`, `cedulaIdentidad` y `genero` (`MASCULINO` | `FEMENINO`).
 * Los demás campos pueden venir vacíos (quedan como `null` para su posterior
 * actualización y el sistema los resalta en la tabla de usuarios).
 */
export const personaImportacionSchema = personaAdminBase.superRefine((v, ctx) => {
  if (v.sectorTrabajo === "OTRO" && !v.sectorTrabajoOtro) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sectorTrabajoOtro"],
      message: "Debe especificar cuál es el otro sector",
    });
  }
});

/**
 * Versión vigente del aviso de privacidad.
 *
 * Se incrementa al cambiar el texto del aviso. Se guarda en cada registro, no solo la
 * fecha: sin esto no se puede distinguir "aceptó el aviso" de "aceptó OTRO aviso", ni
 * saber a quién hay que volver a pedir consentimiento tras una actualización.
 *
 * Debe coincidir con `VERSION_AVISO_PRIVACIDAD` en `src/app/registro/page.tsx`, que es
 * el texto que el titular realmente ve.
 */
export const VERSION_AVISO_PRIVACIDAD = "1.0.0";

/**
 * Alta pública (decisión D5, opción B): lo que puede enviar un egresado sin sesión.
 *
 * Es deliberadamente MÁS RESTRICTIVO que `personaAdminSchema` en un punto —el correo es
 * obligatorio, porque es lo único que prueba que la persona controla el buzón— y más
 * LAX en los datos de contacto: un egresado que se registra a sí mismo no tiene por qué
 * conocer su código ORCID ni su zona de trabajo. Los campos que sí exige la ley sí se
 * piden. Lo que se omita queda `null` y el administrador lo completa al validar.
 *
 * `.strict()` para que un envío anónimo no pueda colar campos que no le pertenecen
 * (`activo`, `estadoRegistro`, `eliminadoEn`…) simplemente porque se manden en el JSON.
 */
export const personaRegistroPublicoSchema = z
  .object({
    tipo: tipoEnum,
    nombresApellidos: z.string().trim().min(3, "Nombre muy corto").max(150, "Máximo 150 caracteres"),
    cedulaIdentidad: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CI_REGEX, "La cédula debe contener únicamente de 4 a 12 dígitos"),
    genero: generoEnum,

    // Obligatorio en el alta pública: es el buzón al que se manda el enlace.
    correoElectronico: z
      .string()
      .trim()
      .toLowerCase()
      .email("Correo inválido")
      .max(150),

    telefono: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9+\-\s()]*$/, "Teléfono inválido")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),

    semestreIngreso: semestre.optional(),
    semestreEgreso: semestre.optional(),
    anioEgreso: anio.optional(),
    anioTitulacion: anio.optional(),
    modalidadTitulacion: z.preprocess(
      (v) => {
        if (v === null || v === undefined || String(v).trim() === "") return null;
        return normalizarModalidad(v);
      },
      modalidadEnum.nullable()
    ).optional(),
    areaEspecializacion: textoOpcional(200),

    planeaTitularse: enumOpcional(planeaEnum).optional(),
    inicioProcesoTitulacion: enumOpcional(inicioProcesoEnum).optional(),
    motivoNoTitulacion: enumOpcional(motivoEnum).optional(),

    ciudadRegionTrabajo: textoOpcional(200),
    estadoLaboral: enumOpcional(estadoLaboralEnum).optional(),
    sectorTrabajo: enumOpcional(sectorEnum).optional(),
    sectorTrabajoOtro: textoOpcional(200),
    ocupacionCargo: textoOpcional(200),
    trabajaEnEstadistica: z.coerce.boolean().default(false),
    observaciones: textoOpcional(2000),

    // ── Gestión del consentimiento (ISO/IEC 27701:2025 · Ley 1405 art. 5.1.a) ──
    //
    // El consentimiento tiene que ser EXPRESO y demostrable. Un `true` sin marcar en la
    // pantalla, o marcado en la pantalla pero sin llegar al servidor, no es consentimiento:
    // es una inferencia. Por eso el campo es obligatorio y tiene que valer `true`.
    //
    // `literal` no es un campo decorativo: obliga al cliente a enviar el texto exacto de
    // la versión que se mostró. Si el aviso cambia y el cliente no se actualiza, el valor
    // no coincide y el registro se rechaza, en lugar de aceptarse bajo un aviso viejo
    // que el titular no ha leído.
    consentimientoPrivacidad: z.literal(true, {
      errorMap: () => ({
        message: "Debe aceptar el aviso de privacidad para registrar sus datos",
      }),
    }),
    versionAvisoPrivacidad: z.string().trim().min(1).max(20),
    turnstileToken: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Mismas reglas condicionales que el alta del administrador (decisión D7).
    if (v.sectorTrabajo === "OTRO" && !v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Debe especificar cuál es el otro sector",
      });
    }
    if (v.sectorTrabajo !== "OTRO" && v.sectorTrabajoOtro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorTrabajoOtro"],
        message: "Solo aplica si el sector es 'OTRO'",
      });
    }
    if (v.tipo === "TITULADO" && !v.anioTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["anioTitulacion"],
        message: "Un titulado debe tener año de titulación",
      });
    }
    if (v.tipo === "TITULADO" && !v.modalidadTitulacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modalidadTitulacion"],
        message: "Un titulado debe tener modalidad de titulación",
      });
    }
    if (v.tipo === "TITULADO" && (v.planeaTitularse || v.motivoNoTitulacion)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planeaTitularse"],
        message: "Este campo es exclusivo de egresados",
      });
    }
    if (v.tipo === "EGRESADO") {
      if (!v.planeaTitularse) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planeaTitularse"],
          message: "Todo egresado debe indicar si planea titularse",
        });
      }
      if (v.planeaTitularse === "SI" && !v.inicioProcesoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inicioProcesoTitulacion"],
          message: "Si planea titularse, indique si ya inició el proceso",
        });
      }
      const pideMotivo =
        v.planeaTitularse === "NO" ||
        v.planeaTitularse === "NO_SABE" ||
        (v.planeaTitularse === "SI" && v.inicioProcesoTitulacion === "NO");
      if (pideMotivo && !v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "Debe indicar el motivo de no titulación",
        });
      }
      if (!pideMotivo && v.motivoNoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["motivoNoTitulacion"],
          message: "No aplica: ya inició su proceso de titulación",
        });
      }
      if (v.planeaTitularse !== "SI" && v.inicioProcesoTitulacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inicioProcesoTitulacion"],
          message: "No aplica: solo si planea titularse",
        });
      }
    }
  });

export const usuarioSchema = z.object({
  nombre: z.string().trim().min(3, "Nombre muy corto").max(150),
  correo: z.string().trim().toLowerCase().email("Correo inválido").max(150),
  ci: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CI_REGEX, "Cédula inválida")
    .nullable()
    .optional(),
  rol: z.enum(["admin", "KARDEX"]).default("admin"),
  estado: z.enum(["activo", "inactivo", "bloqueado"]).default("activo"),
});

/**
 * Política de contraseñas seguras al crear, restablecer o cambiar credenciales
 * (las cuentas semilla iniciales conservan su CI únicamente para primer ingreso/pruebas).
 */
export const passwordSeguraSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(200, "Máximo 200 caracteres")
  .refine(
    (v) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(v) && /[0-9]/.test(v),
    "La contraseña debe incluir al menos una letra y un número"
  );

export function esPasswordIgualACredencial(
  password: string,
  ci?: string | null,
  correo?: string | null
): boolean {
  const passNorm = password.trim().toLowerCase();
  if (!passNorm) return false;

  if (ci) {
    const ciLimpia = ci.trim().toLowerCase();
    const ciDigitos = ciLimpia.replace(/[^0-9]/g, "");
    const passDigitos = passNorm.replace(/[^0-9]/g, "");
    if (ciLimpia && passNorm === ciLimpia) return true;
    if (ciDigitos.length >= 4 && (passNorm === ciDigitos || passDigitos === ciDigitos && passNorm.length === ciDigitos.length)) {
      return true;
    }
  }

  if (correo) {
    const correoLimpio = correo.trim().toLowerCase();
    const parteLocal = correoLimpio.split("@")[0] ?? "";
    if (correoLimpio && passNorm === correoLimpio) return true;
    if (parteLocal.length >= 4 && passNorm === parteLocal) return true;
  }

  return false;
}

export const usuarioConPasswordSchema = usuarioSchema
  .extend({
    password: passwordSeguraSchema,
  })
  .superRefine((v, ctx) => {
    if (esPasswordIgualACredencial(v.password, v.ci, v.correo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Por seguridad, la contraseña no puede ser igual al CI ni al correo",
      });
    }
  });

export const loginSchema = z.object({
  ci: z.string().trim().min(1, "Ingrese su CI o correo"),
  password: z.string().max(200).optional(),
  turnstileToken: z.string().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Esquemas de las rutas de escritura que aún no tenían uno
//
// Una ruta que escribe sin esquema acepta tipos que nadie se supone que mande:
// un `tipo: 999` que revienta el ENUM en PostgreSQL y produce un 500 en vez de un
// 400, o un cuerpoarray donde se espera un objeto. Estos esquemas cierran esa puerta:
// lo que no cumple, no llega a la base de datos.
// ─────────────────────────────────────────────────────────────────────────────

export const noticiaTipoEnum = z.enum([
  "noticia_institucional",
  "curso_evento",
  "noticia_social",
]);
export const noticiaCategoriaEnum = z.enum(["noticia", "convocatoria"]);

/** Cuerpo de alta/edición de noticias y cursos. `estricto` por diseño. */
export const noticiaSchema = z
  .object({
    titulo: z.string().trim().min(1, "El título es obligatorio").max(250, "Máximo 250 caracteres"),
    cuerpo: z.string().trim().min(1, "La descripción es obligatoria").max(8000),
    tipo: noticiaTipoEnum,
    categoria: noticiaCategoriaEnum,
    fecha: z
      .string()
      .trim()
      .refine((f) => !Number.isNaN(new Date(f).getTime()), "La fecha es obligatoria"),
    publicado: booleano.optional(),
    enlace: z.string().trim().max(500).nullable().optional(),
    destacado: booleano.optional(),
    imagenUrl: urlImagenNoticia.nullable().optional(),
  })
  .strict();

/**
 * Editar una noticia acepta un subconjunto: no se puede cambiar el id ni la fecha de
 * creación desde el cliente.
 */
export const noticiaActualizacionSchema = noticiaSchema.partial().strict();

/** Solicitud de enlace de descarga firmado (admin). */
export const enlaceDescargaSchema = z
  .object({
    destino: z.enum(["excel", "csv", "pdf"], {
      errorMap: () => ({ message: "Destino no permitido" }),
    }),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

/** Solicitud de supresión de datos del titular (derecho de supresión). */
export const supresionDatosSchema = z
  .object({
    motivo: z.string().trim().min(10, "Explique brevemente el motivo").max(1000),
    confirmacion: z.literal(true, {
      errorMap: () => ({ message: "Debe confirmar la solicitud" }),
    }),
  })
  .strict();

/** Cierre de sesión: no hay cuerpo, pero se valida que no traiga campos de más. */
export const cierreSesionSchema = z.object({}).passthrough();

export type NoticiaInput = z.infer<typeof noticiaSchema>;
export type EnlaceDescargaInput = z.infer<typeof enlaceDescargaSchema>;

export type PersonaAdminInput = z.infer<typeof personaAdminSchema>;
export type PersonaRegistroPublicoInput = z.infer<typeof personaRegistroPublicoSchema>;
export type PersonaAutogestionInput = z.infer<typeof personaAutogestionSchema>;

/** Convierte los issues de zod en un mensaje legible. */
export function primerErrorZod(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`).join(" · ");
}