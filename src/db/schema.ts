import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const tipoEstudianteEnum = pgEnum("tipo_estudiante", [
  "TITULADO",
  "EGRESADO",
]);

export const generoEnum = pgEnum("genero_enum", [
  "MASCULINO",
  "FEMENINO",
  "PREFIERO_NO_DECIR",
]);

/**
 * Ciclo de vida del registro (decisión D5, opción B: alta pública).
 *
 * PENDIENTE → el egresado se registró solo y todavía no fue validado por la Carrera: no
 *             cuenta en métricas ni puede entrar al sistema.
 * VALIDADO  → alta efectiva. Todos los registros ya existentes pasan a este estado con
 *             la migración, porque ninguno nació pendiente de validación.
 * RECHAZADO → el administrador lo descartó. La fila y el motivo se conservan, igual que
 *             en la baja lógica, para poder contabilizar los descartes y sus causas.
 */
export const estadoRegistroEnum = pgEnum("estado_registro_enum", [
  "PENDIENTE",
  "VALIDADO",
  "RECHAZADO",
]);

export const modalidadTitulacionEnum = pgEnum("modalidad_titulacion_enum", [
  "Tesis",
  "Proyecto de grado",
  "Examen de grado",
  "Trabajo dirigido",
  "Otro",
]);

export const planeaTitularseEnum = pgEnum("planea_titularse_enum", [
  "SI",
  "NO",
  "NO_SABE",
]);

export const inicioProcesoEnum = pgEnum("inicio_proceso_enum", [
  "SI",
  "NO",
]);

export const motivoNoTitulacionEnum = pgEnum("motivo_no_titulacion_enum", [
  "LABORAL",
  "ECONOMICO",
  "PERSONAL",
  "EN_PROCESO",
  "OTRO",
]);

export const estadoLaboralEnum = pgEnum("estado_laboral_enum", [
  "EMPLEADO",
  "DESEMPLEADO",
  "INDEPENDIENTE",
]);

export const sectorTrabajoEnum = pgEnum("sector_trabajo_enum", [
  "PUBLICO",
  "PRIVADO",
  "ACADEMICO",
  "ONG",
  "OTRO",
]);

export const usuarioRolEnum = pgEnum("usuario_rol_enum", [
  "admin",
  "usuario",
  "KARDEX",
]);

export const usuarioEstadoEnum = pgEnum("usuario_estado_enum", [
  "activo",
  "inactivo",
  "bloqueado",
]);

export const noticiasTipoEnum = pgEnum("noticias_tipo_enum", [
  "noticia_institucional",
  "curso_evento",
  "noticia_social",
]);

export const auditAccionEnum = pgEnum("audit_accion_enum", [
  "crear",
  "editar",
  "eliminar",
  "exportar",
  "importar",
  // Derechos del titular (ISO/IEC 27701:2025, cláusula sobre derechos de los titulares).
  // Se registran en el mismo log que las acciones administrativas para que el
  // ejercicio de un derecho sea trazable y auditable por la misma vía.
  "consultar_datos",
  "exportar_datos",
  "suprimir_datos",
  "consentimiento",
]);

// ── Tabla Principal Unificada: personas ───────────────────────────────────────
export const personas = pgTable(
  "personas",
  {
    id: serial("id").primaryKey(),

    // Discriminador de entidad
    tipo: tipoEstudianteEnum("tipo").notNull().default("TITULADO"),

    // ── Campos Kardex Estáticos (Marcados con 'K' - Inmutables) ───────────────
    nombresApellidos: text("nombres_apellidos").notNull(),
    cedulaIdentidad: varchar("cedula_identidad", { length: 20 }).notNull().unique(),
    nivelEstudio: varchar("nivelestudio", { length: 50 }),
    realizoCursoUltimos3Anos: boolean("realizo_curso_ultimos_3_anios"),
    ultimoCurso: varchar("ultimocurso", { length: 200 }),
    genero: generoEnum("genero").notNull().default("PREFIERO_NO_DECIR"),
    semestreIngreso: varchar("semestre_ingreso", { length: 20 }), // ej. "I/2018", "II/2019"
    semestreEgreso: varchar("semestre_egreso", { length: 30 }),   // ej. "1er semestre 2023", "I/2023"
    anioEgreso: integer("anio_egreso"),

    // ── Campos Exclusivos de Titulados (Kardex 'K') ───────────────────────────
    anioTitulacion: integer("anio_titulacion"),
    modalidadTitulacion: modalidadTitulacionEnum("modalidad_titulacion"),
    areaEspecializacion: text("area_especializacion"),

    // ── Campos Condicionales de Egresados ─────────────────────────────────────
    planeaTitularse: planeaTitularseEnum("planea_titularse"),
    inicioProcesoTitulacion: inicioProcesoEnum("inicio_proceso_titulacion"),
    motivoNoTitulacion: motivoNoTitulacionEnum("motivo_no_titulacion"),

    // ── Campos Dinámicos de Contacto y Ubicación (Compartidos) ─────────────────
    correoElectronico: text("correo_electronico"),
    telefono: varchar("telefono", { length: 20 }),
    redesSociales: text("redes_sociales"), // URLs LinkedIn / Facebook
    ciudadRegionTrabajo: text("ciudad_region_trabajo"), // ej. "La Paz, Bolivia", "Santa Cruz", "Exterior"

    // ── Campo de imagen (minijerarquía: URL o ruta local) ─────────────────────
    imagenUrl: varchar("imagen_url", { length: 500 }),

    // ── Campos Dinámicos de Situación Laboral y Métricas ───────────────────────
    estadoLaboral: estadoLaboralEnum("estado_laboral").default("DESEMPLEADO"),
    sectorTrabajo: sectorTrabajoEnum("sector_trabajo"),
    sectorTrabajoOtro: text("sector_trabajo_otro"),
    ocupacionCargo: text("ocupacion_cargo"),
    trabajaEnEstadistica: boolean("trabaja_en_estadistica").default(false),

    // Métricas calculadas para Acreditación (en meses)
    tiempoEgresoTitulacionMeses: integer("tiempo_egreso_titulacion_meses"),
    tiempoInsercionLaboralMeses: integer("tiempo_insercion_laboral_meses"),

    // Observaciones administrativas
    observaciones: text("observaciones"),

    // Baja lógica (decisión D3): el DELETE marca la baja en vez de borrar la fila.
    // Los datos de un egresado forman parte del histórico de acreditación, y los
    // reportes por año y sector deben seguir contando igual. Un hard delete los
    // haría desaparecer sin dejar rastro del contenido.
    activo: boolean("activo").notNull().default(true),
    estadoRegistro: estadoRegistroEnum("estado_registro").notNull().default("VALIDADO"),
    fechaValidacion: timestamp("fecha_validacion"),
    motivoRechazo: text("motivo_rechazo"),
    eliminadoEn: timestamp("eliminado_en"),
    eliminadoPor: integer("eliminado_por").references(() => usuarios.id, { onDelete: "set null" }),
    motivoBaja: text("motivo_baja"),

    // ── Gestión del consentimiento (ISO/IEC 27701:2025 · Ley 1405 art. 5) ───────
    //
    // El aviso de privacidad exige poder DEMOSTRAR que el titular Rhineó y cuándo.
    // Sin marca de tiempo y sin huella del texto vigente, esa prueba no existe: un
    // registro sin `consentimientoOtorgadoEn` no cumple y, además, no se puede saber
    // si el titular aceptó la versión del aviso que se publica hoy o una anterior.
    //
    // `consentimientoVersion` guarda la versión del aviso aceptada, no la última
    // publicada: así, si el aviso cambia, se puede listar quién debe volver a aceptarlo.
    consentimientoOtorgado: boolean("consentimiento_otorgado").notNull().default(false),
    consentimientoOtorgadoEn: timestamp("consentimiento_otorgado_en"),
    consentimientoVersion: varchar("consentimiento_version", { length: 20 }),
    // IP y user agent del envío del formulario. La Ley 1405 exige constancia de la
    // fecha, hora y medio; guardarlos permite acreditarla.
    consentimientoIp: varchar("consentimiento_ip", { length: 45 }),

    // ── Cambio obligatorio de CI a correo (titulares y egresados) ─────────────────
    //
    // Los titulares y egresados entran con CI + contraseña. Se les pide cambiar a
    // correo + contraseña. Pueden saltarlo hasta 5 veces; en la 6ta es obligatorio.
    // `cambiosCorreoRestantes` inicia en 5 y se decrementa cada vez que saltan.
    correoObligatorio: boolean("correo_obligatorio").notNull().default(false),
    cambiosCorreoRestantes: integer("cambios_correo_restantes").notNull().default(5),

    // ── Derecho de supresión (derecho deCancellation / rectificación) ────────────
    //
    // La baja lógica (D3) NO satisface el derecho de supresión: conserva la fila y
    // todos los campos. Se marcan aquí los campos que deben anonimizarse cuando el
    // titular lo exerce, para que el borrado sea efectivo sin perder el agregado
    // estadístico (que es lo único que justifica conservar la fila).
    supresionSolicitadaEn: timestamp("supresion_solicitada_en"),
    supresionCompletadaEn: timestamp("supresion_completada_en"),
    supresionMotivo: text("supresion_motivo"),

    // Auditoría temporal
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").defaultNow(),
  },
  (table) => ({
    ciSoloDigitos: check("personas_ci_solo_digitos", sql`${table.cedulaIdentidad} ~ '^[0-9]+$'`),
    // Imposibilidad de tener el consentimiento marcado sin fecha, o fecha sin marca:
    // es la regla que hace que el campo no pueda mentir.
    consentimientoCoherente: check(
      "personas_consentimiento_coherente",
      sql`(${table.consentimientoOtorgado} and ${table.consentimientoOtorgadoEn} is not null and ${table.consentimientoVersion} is not null)
          or (not ${table.consentimientoOtorgado} and ${table.consentimientoOtorgadoEn} is null)`
    ),
    ciIdx: uniqueIndex("personas_ci_unique_idx").on(table.cedulaIdentidad),
    consentimientoIdx: index("idx_personas_consentimiento").on(table.consentimientoOtorgado),
    tipoIdx: index("idx_personas_tipo").on(table.tipo),
    estadoLaboralIdx: index("idx_personas_estado_laboral").on(table.estadoLaboral),
    sectorTrabajoIdx: index("idx_personas_sector_trabajo").on(table.sectorTrabajo),
    anioTitulacionIdx: index("idx_personas_anio_titulacion").on(table.anioTitulacion),
    anioEgresoIdx: index("idx_personas_anio_egreso").on(table.anioEgreso),
    ciudadIdx: index("idx_personas_ciudad").on(table.ciudadRegionTrabajo),
    activoIdx: index("idx_personas_activo").on(table.activo),
  })
);

export const credencialesPersona = pgTable("credenciales_persona", {
  idPersona: integer("id_persona")
    .primaryKey()
    .references(() => personas.id, { onDelete: "cascade" }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

export const carreras = pgTable(
  "carreras",
  {
    id: serial("id").primaryKey(),
    ci: varchar("ci", { length: 20 })
      .notNull()
      .references(() => personas.cedulaIdentidad, { onDelete: "cascade" }),
    carrera: varchar("carrera", { length: 200 }),
    universidad: varchar("universidad", { length: 200 }),
    facultad: varchar("facultad", { length: 200 }),
    grados: varchar("grados", { length: 200 }),
    creadaEn: timestamp("creada_en").notNull().defaultNow(),
  },
  (table) => ({ ciIdx: index("idx_carreras_ci").on(table.ci) })
);

export const solicitudTitulado = pgTable(
  "solicitudtitulado",
  {
    id: serial("id").primaryKey(),
    ci: varchar("ci", { length: 20 })
      .notNull()
      .references(() => personas.cedulaIdentidad, { onDelete: "restrict" }),
    fechaSolicitud: timestamp("fechasolicitud").notNull().defaultNow(),
    fechaRevision: timestamp("fecharevision"),
    ipMaquinaAprobo: varchar("ipmaquinaaprobo", { length: 45 }),
    nombre: varchar("nombre", { length: 150 }),
    detalle: text("detalle"),
    estado: varchar("estado", { length: 30 }).notNull().default("PENDIENTE"),
  },
  (table) => ({
    estadoValido: check("solicitudtitulado_estado_valido", sql`${table.estado} in ('PENDIENTE', 'ACEPTADO', 'RECHAZADO')`),
    motivoRechazo: check("solicitudtitulado_rechazo_con_detalle", sql`${table.estado} <> 'RECHAZADO' or length(btrim(${table.detalle})) > 0`),
    pendienteSinRevision: check("solicitudtitulado_revision_estado", sql`(${table.estado} = 'PENDIENTE' and ${table.fechaRevision} is null) or (${table.estado} in ('ACEPTADO', 'RECHAZADO') and ${table.fechaRevision} is not null)`),
    unaPendientePorCi: uniqueIndex("solicitudtitulado_una_pendiente_por_ci").on(table.ci).where(sql`${table.estado} = 'PENDIENTE'`),
    ciIdx: index("idx_solicitudtitulado_ci_fecha").on(table.ci, table.fechaSolicitud),
    estadoIdx: index("idx_solicitudtitulado_estado_fecha").on(table.estado, table.fechaSolicitud),
  })
);

export const solicitudTituladoHistorial = pgTable(
  "solicitudtitulado_historial",
  {
    id: serial("id").primaryKey(),
    solicitudId: integer("solicitud_id")
      .notNull()
      .references(() => solicitudTitulado.id, { onDelete: "cascade" }),
    ci: varchar("ci", { length: 20 })
      .notNull()
      .references(() => personas.cedulaIdentidad, { onDelete: "restrict" }),
    estado: varchar("estado", { length: 30 }).notNull(),
    fecha: timestamp("fecha").notNull().defaultNow(),
    nombre: varchar("nombre", { length: 150 }),
    ip: varchar("ip", { length: 45 }),
    detalle: text("detalle"),
  },
  (table) => ({
    estadoValido: check("solicitudtitulado_historial_estado_valido", sql`${table.estado} in ('PENDIENTE', 'ACEPTADO', 'RECHAZADO')`),
    solicitudIdx: index("idx_solicitudtitulado_historial_solicitud").on(table.solicitudId, table.fecha),
  })
);

export const solicitudTituladoDocumento = pgTable(
  "solicitudtitulado_documentos",
  {
    id: serial("id").primaryKey(),
    solicitudId: integer("solicitud_id")
      .notNull()
      .references(() => solicitudTitulado.id, { onDelete: "cascade" }),
    nombreOriginal: varchar("nombre_original", { length: 255 }).notNull(),
    nombreAlmacenado: varchar("nombre_almacenado", { length: 100 }).notNull().unique(),
    tipoMime: varchar("tipo_mime", { length: 100 }).notNull(),
    tamanoBytes: integer("tamano_bytes").notNull(),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (table) => ({
    tamanoValido: check("solicitudtitulado_documento_tamano_valido", sql`${table.tamanoBytes} > 0 and ${table.tamanoBytes} <= 10485760`),
    solicitudIdx: index("idx_solicitudtitulado_documentos_solicitud").on(table.solicitudId),
  })
);

// ── Tabla de Usuarios Administrativos ─────────────────────────────────────────
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  ci: varchar("ci", { length: 20 }),
  nombre: text("nombre").notNull(),
  correo: varchar("correo", { length: 150 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  rol: usuarioRolEnum("rol").notNull().default("admin"),
  estado: usuarioEstadoEnum("estado").notNull().default("activo"),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en").defaultNow(),
});

// ── Tabla de Sesiones (D2 · decisión aprobada) ────────────────────────────────
/**
 * El token de `lib/sesion.ts` es un HMAC sobre un JSON, y por sí solo es *stateless*:
 * mientras no expiren sus 30 minutos no hay forma de cortarlo, y tampoco queda rastro
 * de qué usuarios están conectados. Esta tabla guarda solo el SHA-256 del token
 * (nunca el token en sí: si alguien lee la base no sirve una fila para suplantar a
 * nadie) y permite revocar un acceso al instante y auditar las sesiones activas.
 */
export const sesiones = pgTable(
  "sesiones",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario").references(() => usuarios.id, { onDelete: "cascade" }),
    idPersona: integer("id_persona").references(() => personas.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    ci: varchar("ci", { length: 20 }).notNull(),
    rol: varchar("rol", { length: 30 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    creadaEn: timestamp("creada_en").notNull().defaultNow(),
    ultimaActividadEn: timestamp("ultima_actividad_en").notNull().defaultNow(),
    expiraEn: timestamp("expira_en").notNull(),
    revocadaEn: timestamp("revocada_en"),
    motivoRevocacion: varchar("motivo_revocacion", { length: 120 }),
  },
  (table) => ({
    idUsuarioIdx: index("idx_sesiones_id_usuario").on(table.idUsuario),
    ciIdx: index("idx_sesiones_ci").on(table.ci),
    expiraEnIdx: index("idx_sesiones_expira_en").on(table.expiraEn),
    revocadaEnIdx: index("idx_sesiones_revocada_en").on(table.revocadaEn),
  })
);

// ── Tabla de Verificaciones (D5 · alta pública) ──────────────────────────────
/**
 * Enlaces de un solo uso para verificar que el correo que se_AUTO registra es real.
 *
 * Se guarda el SHA-256 del token, nunca el token: leer la tabla no permite completar
 * el registro de otra persona. `intentos` limita los intentos por IP+token para que el
 * enlace no se pueda adivinar por fuerza bruta.
 */
export const verificaciones = pgTable(
  "verificaciones",
  {
    id: serial("id").primaryKey(),
    idPersona: integer("id_persona")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    proposito: varchar("proposito", { length: 40 }).notNull().default("REGISTRO"),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    destino: varchar("destino", { length: 150 }).notNull(),
    intentos: integer("intentos").notNull().default(0),
    expiraEn: timestamp("expira_en").notNull(),
    usadaEn: timestamp("usada_en"),
    creadaEn: timestamp("creada_en").notNull().defaultNow(),
  },
  (table) => ({
    idPersonaIdx: index("idx_verificaciones_id_persona").on(table.idPersona),
    expiraEnIdx: index("idx_verificaciones_expira_en").on(table.expiraEn),
  })
);

// ── Tabla de Noticias y Cursos ────────────────────────────────────────────────
export const noticiasCursos = pgTable(
  "noticias_cursos",
  {
    id: serial("id").primaryKey(),
    titulo: varchar("titulo", { length: 250 }).notNull(),
    cuerpo: text("cuerpo").notNull(),
    tipo: noticiasTipoEnum("tipo").notNull().default("noticia_institucional"),
    categoria: varchar("categoria", { length: 20 }).notNull().default("noticia"),
    fecha: date("fecha").notNull(),
    imagenUrl: varchar("imagen_url", { length: 500 }),
    publicado: boolean("publicado").notNull().default(true),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").defaultNow(),
  },
  (table) => ({
    tipoIdx: index("idx_noticias_tipo").on(table.tipo),
    fechaIdx: index("idx_noticias_fecha").on(table.fecha),
  })
);

// ── Tabla de Auditoría (Audit Log) ────────────────────────────────────────────
/**
 * Registro encadenado de actividad (ISO/IEC 27001:2022, A.8.16 "Logging"; A.8.15 en la
 * edición 2013, que es de donde procede el requisito original del proyecto).
 *
 * `hash` y `hashAnterior` encadenan cada fila con la anterior. Si alguien borra o altera
 * una fila ya escrita —un administrador con acceso a la tabla, o una restauración de
 * backup incompleta— la cadena deja de cuadrar y el procedimiento de verificación
 * detecta exactamente qué fila se manipuló y en qué punto se rompió.
 *
 * La cadena no impide el borrado por sí sola: por eso la migración añade además un
 * trigger que RECHAZA cualquier UPDATE o DELETE sobre la tabla. La garantía la impone el
 * motor, no el código de aplicación, porque el código se puede cambiar y el permiso de
 * escritura de la tabla no debería depender de eso.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario").references(() => usuarios.id, { onDelete: "set null" }),
    accion: auditAccionEnum("accion").notNull(),
    entidad: varchar("entidad", { length: 100 }).notNull(),
    entidadId: integer("entidad_id"),
    detalles: text("detalles"),
    datosAnteriores: text("datos_anteriores"),
    datosNuevos: text("datos_nuevos"),
    ip: varchar("ip", { length: 45 }),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),

    // Cadena de integridad. `hashAnterior` es el `hash` de la fila previa (la primera
    // fila de la cadena lo tiene nulo).
    hashAnterior: varchar("hash_anterior", { length: 64 }),
    hash: varchar("hash", { length: 64 }).notNull(),
  },
  (table) => ({
    accionIdx: index("idx_audit_accion").on(table.accion),
    creadoEnIdx: index("idx_audit_creado_en").on(table.creadoEn),
  })
);

// ── Relaciones ────────────────────────────────────────────────────────────────
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  auditLogs: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [auditLog.idUsuario],
    references: [usuarios.id],
  }),
}));

export const sesionesRelations = relations(sesiones, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [sesiones.idUsuario],
    references: [usuarios.id],
  }),
  persona: one(personas, {
    fields: [sesiones.idPersona],
    references: [personas.id],
  }),
}));

// ── Tipos TypeScript inferidos ────────────────────────────────────────────────
export type Persona = typeof personas.$inferSelect;
export type NuevaPersona = typeof personas.$inferInsert;

export type Carrera = typeof carreras.$inferSelect;
export type NuevaCarrera = typeof carreras.$inferInsert;

export type SolicitudTitulado = typeof solicitudTitulado.$inferSelect;
export type NuevaSolicitudTitulado = typeof solicitudTitulado.$inferInsert;

export type SolicitudTituladoHistorial = typeof solicitudTituladoHistorial.$inferSelect;
export type NuevoSolicitudTituladoHistorial = typeof solicitudTituladoHistorial.$inferInsert;

export type SolicitudTituladoDocumento = typeof solicitudTituladoDocumento.$inferSelect;
export type NuevoSolicitudTituladoDocumento = typeof solicitudTituladoDocumento.$inferInsert;

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;

export type NoticiaCurso = typeof noticiasCursos.$inferSelect;
export type NuevaNoticiaCurso = typeof noticiasCursos.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NuevoAuditLogEntry = typeof auditLog.$inferInsert;

export type SesionRow = typeof sesiones.$inferSelect;
export type NuevaSesionRow = typeof sesiones.$inferInsert;

export type VerificacionRow = typeof verificaciones.$inferSelect;
export type NuevaVerificacionRow = typeof verificaciones.$inferInsert;
