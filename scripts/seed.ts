/**
 * Seed de datos de demostración para `sistitulados_db`.
 *
 * IMPORTANTE (Fase 1):
 *  - Este script YA NO crea tablas ni tipos ENUM. La estructura la genera Drizzle:
 *        pnpm db:generate     -> crea los archivos de migración en ./drizzle
 *        pnpm db:migrate      -> aplica las migraciones
 *  - NO hace TRUNCATE. Para reiniciar los datos de prueba hay que pasar --reset.
 *  - Inserta el usuario administrador con la contraseña hasheada, y noticias de ejemplo.
 *
 * Uso:
 *   pnpm seed              -> inserta los datos (falla si ya existen)
 *   pnpm seed -- --reset   -> borra primero las filas de prueba (solo desarrollo)
 */

import { db, pool } from "../src/db";
import { personas, usuarios, noticiasCursos, carreras, solicitudTitulado, solicitudTituladoHistorial, credencialesPersona } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { hashPassword } from "../src/lib/password";
import { asegurarCuentaKardex } from "./seed_kardex";

const RESET = process.argv.includes("--reset");

const ADMIN_CORREO = "adm@gen.bo";
const ADMIN_PASSWORD = "adm";

async function main() {
  const yaHay = await db.select({ n: sql<number>`count(*)` }).from(personas);
  if ((yaHay[0]?.n ?? 0) > 0) {
    if (!RESET) {
      const kardex = await asegurarCuentaKardex();
      console.log(
        `La tabla 'personas' ya tiene ${yaHay[0].n} registros. ` +
          `No se insertó nada. Usa "pnpm seed -- --reset" solo en desarrollo.`
      );
      if (kardex) console.log(`Kardex de prueba: ${kardex.correo} / ${kardex.password}`);
      await cerrar();
      return;
    }
    console.log("--reset: borrando datos de prueba...");
    await db.execute(sql`DELETE FROM solicitudtitulado_historial;`);
    await db.execute(sql`DELETE FROM solicitudtitulado;`);
    await db.execute(sql`DELETE FROM carreras;`);
    await db.execute(sql`DELETE FROM verificaciones;`);
    await db.execute(sql`DELETE FROM sesiones;`);
    await db.execute(sql`DELETE FROM personas;`);
    await db.execute(sql`DELETE FROM noticias_cursos;`);
  }

  // ── Usuarios administradores ────────────────────────────────────────────────
  console.log("Insertando o actualizando usuarios administradores...");
  await db
    .insert(usuarios)
    .values({
      ci: null,
      nombre: "Administrador",
      correo: ADMIN_CORREO,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      rol: "admin",
      estado: "activo",
    })
    .onConflictDoUpdate({
      target: usuarios.correo,
      set: {
        passwordHash: hashPassword(ADMIN_PASSWORD),
        estado: "activo",
      },
    });
  const kardex = await asegurarCuentaKardex();

  // ── Titulados ───────────────────────────────────────────────────────────────
  const dataTitulados = [
    {
      tipo: "TITULADO" as const,
      nombresApellidos: "Carlos Alberto Mendoza Ramos",
      cedulaIdentidad: "6893412",
      genero: "MASCULINO" as const,
      semestreIngreso: "I/2016",
      semestreEgreso: "II/2020",
      anioEgreso: 2020,
      anioTitulacion: 2021,
      nivelEstudio: "LICENCIATURA",
      realizoCursoUltimos3Anos: true,
      ultimoCurso: "ANÁLISIS DE DATOS CON R",
      modalidadTitulacion: "Tesis" as const,
      areaEspecializacion: "Ciencia de Datos y Bioestadística",
      correoElectronico: "carlos.mendoza@umsa.bo",
      telefono: "71548923",
      redesSociales: "linkedin.com/in/cmendoza-stat",
      ciudadRegionTrabajo: "La Paz, Bolivia",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "PUBLICO" as const,
      ocupacionCargo: "Especialista en Modelamiento Estadístico - INE",
      trabajaEnEstadistica: true,
      tiempoEgresoTitulacionMeses: 10,
      tiempoInsercionLaboralMeses: 4,
      observaciones: "Titulado con honores en Tesis.",
    },
    {
      tipo: "TITULADO" as const,
      nombresApellidos: "Mariana Elena Quispe Flores",
      cedulaIdentidad: "7823901",
      genero: "FEMENINO" as const,
      semestreIngreso: "I/2017",
      semestreEgreso: "II/2021",
      anioEgreso: 2021,
      anioTitulacion: 2022,
      modalidadTitulacion: "Proyecto de grado" as const,
      areaEspecializacion: "Econometría y Análisis Actuarial",
      correoElectronico: "mariana.quispe@banco.bo",
      telefono: "76523910",
      redesSociales: "linkedin.com/in/mquispe-actuario",
      ciudadRegionTrabajo: "Santa Cruz, Bolivia",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "PRIVADO" as const,
      ocupacionCargo: "Analista de Riesgo Crediticio - Banco BCP",
      trabajaEnEstadistica: true,
      tiempoEgresoTitulacionMeses: 8,
      tiempoInsercionLaboralMeses: 2,
      observaciones: "Excelente desempeño profesional.",
    },
    {
      tipo: "TITULADO" as const,
      nombresApellidos: "Rodrigo Javier Mamani Choque",
      cedulaIdentidad: "8912344",
      genero: "MASCULINO" as const,
      semestreIngreso: "II/2017",
      semestreEgreso: "I/2022",
      anioEgreso: 2022,
      anioTitulacion: 2023,
      modalidadTitulacion: "Examen de grado" as const,
      areaEspecializacion: "Minería de Datos y Machine Learning",
      correoElectronico: "rodrigo.mamani@tech.com",
      telefono: "78912304",
      redesSociales: "linkedin.com/in/rmamani-ml",
      ciudadRegionTrabajo: "La Paz, Bolivia",
      estadoLaboral: "INDEPENDIENTE" as const,
      sectorTrabajo: "PRIVADO" as const,
      ocupacionCargo: "Consultor de Inteligencia de Negocios (BI)",
      trabajaEnEstadistica: true,
      tiempoEgresoTitulacionMeses: 12,
      tiempoInsercionLaboralMeses: 6,
      observaciones: "Consultoría internacional.",
    },
    {
      tipo: "TITULADO" as const,
      nombresApellidos: "Gabriela Andrea Vargas Pinto",
      cedulaIdentidad: "9123845",
      genero: "FEMENINO" as const,
      semestreIngreso: "I/2018",
      semestreEgreso: "II/2022",
      anioEgreso: 2022,
      anioTitulacion: 2023,
      modalidadTitulacion: "Trabajo dirigido" as const,
      areaEspecializacion: "Estadística Social y Demografía",
      correoElectronico: "gvargas@unicef.org",
      telefono: "70654321",
      redesSociales: "linkedin.com/in/gvargas-stat",
      ciudadRegionTrabajo: "Cochabamba, Bolivia",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "ONG" as const,
      ocupacionCargo: "Oficial de Monitoreo y Evaluación (M&E)",
      trabajaEnEstadistica: true,
      tiempoEgresoTitulacionMeses: 7,
      tiempoInsercionLaboralMeses: 3,
      observaciones: "Proyectos en organismos internacionales.",
    },
    {
      tipo: "TITULADO" as const,
      nombresApellidos: "Fernando David Torrez Gomez",
      cedulaIdentidad: "6023941",
      genero: "MASCULINO" as const,
      semestreIngreso: "I/2015",
      semestreEgreso: "II/2019",
      anioEgreso: 2019,
      anioTitulacion: 2020,
      modalidadTitulacion: "Tesis" as const,
      areaEspecializacion: "Inferencia Bayesiana",
      correoElectronico: "ftorrez@universidad.edu",
      telefono: "73291045",
      redesSociales: "linkedin.com/in/ftorrez-phd",
      ciudadRegionTrabajo: "Santiago, Chile (Exterior)",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "ACADEMICO" as const,
      ocupacionCargo: "Docente Investigador y Candidato Doctoral",
      trabajaEnEstadistica: true,
      tiempoEgresoTitulacionMeses: 11,
      tiempoInsercionLaboralMeses: 5,
      observaciones: "Beca de postgrado en el extranjero.",
    },
    {
      // Casos para ejercitar el filtro por sector "OTRO"
      tipo: "TITULADO" as const,
      nombresApellidos: "Lucía Beatriz Oquendo Salazar",
      cedulaIdentidad: "5543218",
      genero: "FEMENINO" as const,
      semestreIngreso: "II/2016",
      semestreEgreso: "I/2021",
      anioEgreso: 2021,
      anioTitulacion: 2022,
      modalidadTitulacion: "Tesis" as const,
      areaEspecializacion: "Estadística Aplicada a Salud Pública",
      correoElectronico: "lucia.oquendo@gestion.bo",
      telefono: "70112233",
      redesSociales: null,
      ciudadRegionTrabajo: "Tarija, Bolivia",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "OTRO" as const,
      sectorTrabajoOtro: "Gobierno municipal",
      ocupacionCargo: "Jefa de Unidad de Planificación",
      trabajaEnEstadistica: true,
      tiempoEgresoTitulacionMeses: 9,
      tiempoInsercionLaboralMeses: 2,
      observaciones: "Sector registrado vía el campo 'Otro'.",
    },
  ];

  // ── Egresados ───────────────────────────────────────────────────────────────
  const dataEgresados = [
    {
      tipo: "EGRESADO" as const,
      nombresApellidos: "Lucía Belén Gutierrez Morales",
      cedulaIdentidad: "8341920",
      genero: "FEMENINO" as const,
      semestreIngreso: "I/2018",
      semestreEgreso: "II/2023",
      anioEgreso: 2023,
      planeaTitularse: "SI" as const,
      inicioProcesoTitulacion: "SI" as const,
      motivoNoTitulacion: "EN_PROCESO" as const,
      correoElectronico: "lucia.gutierrez@gmail.com",
      telefono: "72091483",
      redesSociales: "linkedin.com/in/lgutierrez",
      ciudadRegionTrabajo: "La Paz, Bolivia",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "PRIVADO" as const,
      ocupacionCargo: "Asistente de Análisis de Datos",
      trabajaEnEstadistica: true,
      tiempoInsercionLaboralMeses: 3,
      observaciones: "Borrador de tesis en revisión por tutor.",
    },
    {
      tipo: "EGRESADO" as const,
      nombresApellidos: "Jorge Luis Condori Apaza",
      cedulaIdentidad: "9048123",
      genero: "MASCULINO" as const,
      semestreIngreso: "II/2018",
      semestreEgreso: "I/2024",
      anioEgreso: 2024,
      planeaTitularse: "SI" as const,
      inicioProcesoTitulacion: "NO" as const,
      motivoNoTitulacion: "LABORAL" as const,
      correoElectronico: "jorge.condori@gmail.com",
      telefono: "71283940",
      redesSociales: "linkedin.com/in/jcondori",
      ciudadRegionTrabajo: "El Alto, Bolivia",
      estadoLaboral: "EMPLEADO" as const,
      sectorTrabajo: "PUBLICO" as const,
      ocupacionCargo: "Técnico Estadístico Municipal",
      trabajaEnEstadistica: true,
      tiempoInsercionLaboralMeses: 2,
      observaciones: "Falta de tiempo por jornada laboral completa.",
    },
    {
      tipo: "EGRESADO" as const,
      nombresApellidos: "Paola Andrea Suarez Mendez",
      cedulaIdentidad: "7129034",
      genero: "FEMENINO" as const,
      semestreIngreso: "I/2017",
      semestreEgreso: "II/2022",
      anioEgreso: 2022,
      planeaTitularse: "NO_SABE" as const,
      inicioProcesoTitulacion: "NO" as const,
      motivoNoTitulacion: "ECONOMICO" as const,
      correoElectronico: "paola.suarez@hotmail.com",
      telefono: "77749102",
      redesSociales: "facebook.com/paola.suarez",
      ciudadRegionTrabajo: "Santa Cruz, Bolivia",
      estadoLaboral: "INDEPENDIENTE" as const,
      sectorTrabajo: "OTRO" as const,
      sectorTrabajoOtro: "Emprendimiento propio",
      ocupacionCargo: "Emprendimiento Comercial",
      trabajaEnEstadistica: false,
      tiempoInsercionLaboralMeses: 8,
      observaciones: "Dedicada a comercio independiente.",
    },
    {
      tipo: "EGRESADO" as const,
      nombresApellidos: "Ñuñez Vargas Cristian Ángel",
      cedulaIdentidad: "6677881",
      genero: "MASCULINO" as const,
      semestreIngreso: "I/2019",
      semestreEgreso: "II/2024",
      anioEgreso: 2024,
      planeaTitularse: "NO" as const,
      inicioProcesoTitulacion: "NO" as const,
      motivoNoTitulacion: "PERSONAL" as const,
      correoElectronico: "cnunez@gmail.com",
      telefono: "72334455",
      redesSociales: null,
      ciudadRegionTrabajo: "Potosí, Bolivia",
      estadoLaboral: "DESEMPLEADO" as const,
      sectorTrabajo: null,
      ocupacionCargo: null,
      trabajaEnEstadistica: false,
      tiempoInsercionLaboralMeses: null,
      observaciones: "Caso de prueba para verificar el orden alfabético con Ñ.",
    },
  ];

  console.log("Insertando titulados y egresados de prueba...");
  const insertedPersonas = await db.insert(personas).values([...dataTitulados, ...dataEgresados]).returning({ id: personas.id, ci: personas.cedulaIdentidad });
  await db.insert(credencialesPersona).values(insertedPersonas.map((p) => ({ idPersona: p.id, passwordHash: hashPassword(p.ci) })));

  await db.insert(carreras).values([
    { ci: "7823901", carrera: "INGENIERÍA INFORMÁTICA", universidad: "UNIVERSIDAD MAYOR DE SAN ANDRÉS", facultad: "FACULTAD DE CIENCIAS PURAS Y NATURALES", grados: "LICENCIATURA" },
    { ci: "7823901", carrera: "ECONOMÍA", universidad: "UNIVERSIDAD PÚBLICA DE EL ALTO", facultad: "CIENCIAS ECONÓMICAS", grados: "LICENCIATURA" },
  ]);

  const [solicitudDemo] = await db.insert(solicitudTitulado).values({ ci: "8341920" }).returning({ id: solicitudTitulado.id });
  await db.insert(solicitudTituladoHistorial).values({ solicitudId: solicitudDemo!.id, ci: "8341920", estado: "PENDIENTE" });

  // ── Noticias y convocatorias ────────────────────────────────────────────────
  console.log("Insertando noticias y convocatorias...");
  await db.insert(noticiasCursos).values([
    {
      titulo: "Convocatoria abierta: auxiliares de investigación 2026",
      cuerpo:
        "La Carrera de Estadística abre la convocatoria para auxiliares de investigación.\n\nRequisitos: ser egresado o titulado de la carrera, presentar CI y certificado de egreso.\n\nPlazo de inscripción: hasta el 30 de septiembre. Las postulaciones se reciben en la Secretaría de la Carrera.",
      tipo: "noticia_institucional",
      categoria: "convocatoria",
      fecha: "2026-09-01",
      imagenUrl: null,
      publicado: true,
    },
    {
      titulo: "Curso de actualización en análisis de datos con R",
      cuerpo:
        "Se Dictará un curso de actualización en R orientado a graduados de la carrera.\n\nEl curso es de carácter gratuito y se develope los sábados por la mañana.\n\nCupo limitado. Inscripciones abiertas en la secretaría.",
      tipo: "curso_evento",
      categoria: "noticia",
      fecha: "2026-08-20",
      imagenUrl: null,
      publicado: true,
    },
    {
      titulo: "Reconocimiento a egresados destacados de la carrera",
      cuerpo:
        "La Carrera de Estadística reconoce públicamente el desempeño sobresaliente de varios egresados y titulados.\n\nVarios de nuestros egresados desarrollaron publicaciones en revistas indexadas durante la gestión 2025.",
      tipo: "noticia_social",
      categoria: "noticia",
      fecha: "2026-07-15",
      imagenUrl: null,
      publicado: true,
    },
    {
      titulo: "(Borrador) Resultado de la evaluación externa 2026",
      cuerpo:
        "Borrador de publicación interna. Los resultados oficiales se publicarán cuando la carrera confirme el informe de la comisión evaluadora.",
      tipo: "noticia_institucional",
      categoria: "noticia",
      fecha: "2026-10-01",
      imagenUrl: null,
      publicado: false,
    },
  ]);

  // ── Resumen ────────────────────────────────────────────────────────────────
  const [{ t }] = await db.select({ t: sql<number>`count(*)` }).from(personas);
  const [{ u }] = await db.select({ u: sql<number>`count(*)` }).from(usuarios);
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(noticiasCursos);

  console.log("");
  console.log("Seed completado:");
  console.log(`  - personas:      ${t}`);
  console.log(`  - usuarios:      ${u}`);
  console.log(`  - noticias:      ${n} (1 sin publicar)`);
  console.log("");
  console.log(`Admin: ${ADMIN_CORREO} / ${ADMIN_PASSWORD}`);
  if (kardex) console.log(`Kardex de prueba: ${kardex.correo} / ${kardex.password}`);
  console.log("Titulado ejemplo (CI, sin contraseña): 6893412");
  console.log("Egresado ejemplo (CI, sin contraseña): 8341920");

  await cerrar();
}

async function cerrar() {
  await pool.end();
}

main().catch((err) => {
  console.error("Error en seed:", err);
  process.exit(1);
});