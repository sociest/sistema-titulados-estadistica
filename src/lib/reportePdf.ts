import PDFDocument from "pdfkit";

/**
 * Generación del reporte PDF del dashboard, EN MEMORIA.
 *
 * `important.md` §2 prohíbe explícitamente escribir el archivo en disco
 * (`fs.writeFileSync('./exports/...')`), porque rompe en despliegues serverless o
 * contenedores efímeros. Por eso todo se arma con pdfkit como flujo en memoria y el API
 * Route lo devuelve directo en el cuerpo de la respuesta.
 *
 * El reporte incluye lo que pide la especificación: nombre de la carrera y fecha de
 * generación, KPIs, tablas de distribución y el detalle de registros.
 */

export interface KpiReporte {
  totalTitulados: number;
  tasaEmpleabilidadTitulados: number;
  tiempoPromedioEgresoTitulacion: number;
  tiempoPromedioInsercionTitulados: number;
  porcentajeEmpleoEstadistica: number;
  totalEgresados: number;
  tasaEmpleabilidadEgresados: number;
  tiempoPromedioInsercionEgresados: number;
}

export interface DatosReporte {
  vista: "TITULADOS" | "EGRESADOS" | "COMPARATIVO";
  kpis: KpiReporte;
  porAnio: Array<{ anio: number; titulados: number; egresados: number }>;
  sectoresTitulados: Array<{ name: string; valor: number }>;
  sectoresEgresados: Array<{ name: string; valor: number }>;
  geografiaTitulados: Array<{ ciudad: string; total: number }>;
  geografiaEgresados: Array<{ ciudad: string; total: number }>;
  cohortes: Array<{ cohorte: string; titulados: number; egresados: number; total: number }>;
  modalidades: Array<{ modalidad: string; total: number }>;
  motivos: Array<{ motivo: string; total: number }>;
  personas: Array<Record<string, unknown>>;
}

const AZUL = "#0f2d52";
const GRIS = "#64748b";
const VERDE = "#047857";
const AMBAR = "#b45309";

/** Dibuja una barra horizontal proporcional, para los gráficos sin dependencias. */
function barra(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  fraccion: number,
  color: string
) {
  doc.rect(x, y, Math.max(ancho, 0.1), alto).fill("#e2e8f0");
  const w = Math.max(0, Math.min(1, fraccion)) * ancho;
  if (w > 0) doc.rect(x, y, w, alto).fill(color);
}

/** Etiqueta de valor legible para enums de la base. */
function etiqueta(valor: unknown, mapa: Record<string, string>): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return mapa[String(valor)] ?? String(valor);
}

const ETIQUETAS: Record<string, string> = {
  MASCULINO: "Masculino",
  FEMENINO: "Femenino",
  PREFIERO_NO_DECIR: "Prefiero no decir",
  EMPLEADO: "Empleado",
  DESEMPLEADO: "Desempleado",
  INDEPENDIENTE: "Independiente",
  PUBLICO: "Público",
  PRIVADO: "Privado",
  ACADEMICO: "Académico",
  ONG: "ONG",
  OTRO: "Otro",
  SI: "Sí",
  NO: "No",
  NO_SABE: "No sabe",
  TITULADO: "Titulado",
  EGRESADO: "Egresado",
  LABORAL: "Laboral",
  ECONOMICO: "Económico",
  PERSONAL: "Personal",
  EN_PROCESO: "En proceso",
};

export function generarReportePdf(datos: DatosReporte): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 45, bottom: 50, left: 45, right: 45 },
      info: {
        Title: `Reporte de Seguimiento a Titulados y Egresados - ${datos.vista}`,
        Author: "Carrera de Estadística - UMSA",
        Subject: "Indicadores para la evaluación externa de acreditación",
      },
    });

    const trozos: Buffer[] = [];
    doc.on("data", (c: Buffer) => trozos.push(c));
    doc.on("end", () => resolve(Buffer.concat(trozos)));
    doc.on("error", reject);

    const M = 45;
    const ANCHO = doc.page.width - M * 2;

    const fecha = new Date().toLocaleString("es-BO", {
      dateStyle: "long",
      timeStyle: "short",
    });

    // ── Encabezado institucional ──────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 105).fill(AZUL);
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
       .text("UNIVERSIDAD MAYOR DE SAN ANDRÉS", M, 26, { characterSpacing: 1 });
    doc.fontSize(8).font("Helvetica")
       .text("Facultad de Ciencias Puras y Naturales", M, 38);
    doc.fontSize(15).font("Helvetica-Bold")
       .text("CARRERA DE ESTADÍSTICA", M, 55);
    doc.fontSize(10).font("Helvetica")
       .text("Sistema de Seguimiento a Titulados y Egresados", M, 74);
    doc.fontSize(9)
       .text(`Vista: ${datos.vista}  ·  Generado: ${fecha}`, M, 90);

    doc.fillColor("#0f172a").y = 130;

    const seccion = (titulo: string) => {
      if (doc.y > doc.page.height - 90) doc.addPage();
      doc.moveDown(0.6);
      const y = doc.y;
      doc.rect(M, y + 1, 3, 13).fill("#d97706");
      doc.fillColor(AZUL).fontSize(12).font("Helvetica-Bold").text(titulo, M + 9, y);
      doc.font("Helvetica");
      doc.y = y + 20;
    };

    const tabla = (
      cabeceras: string[],
      anchos: number[],
      filas: string[][],
      colorFila?: (i: number) => string
    ) => {
      const y = doc.y;
      let x = M;
      doc.rect(M, y, ANCHO, 16).fill("#f1f5f9");
      doc.fillColor(AZUL).fontSize(8).font("Helvetica-Bold");
      cabeceras.forEach((h, i) => {
        doc.text(h, x + 4, y + 4.5, { width: anchos[i]! - 8, ellipsis: true });
        x += anchos[i]!;
      });
      doc.font("Helvetica").fontSize(8);

      filas.forEach((fila, idx) => {
        if (doc.y > doc.page.height - 70) {
          doc.addPage();
          // Repetir cabecera al cambiar de página.
          const yy = doc.y;
          doc.rect(M, yy, ANCHO, 16).fill("#f1f5f9");
          doc.fillColor(AZUL).fontSize(8).font("Helvetica-Bold");
          let xx = M;
          cabeceras.forEach((h, i) => {
            doc.text(h, xx + 4, yy + 4.5, { width: anchos[i]! - 8, ellipsis: true });
            xx += anchos[i]!;
          });
          doc.font("Helvetica").fontSize(8);
        }

        const yf = doc.y;
        if (idx % 2 === 1) doc.rect(M, yf, ANCHO, 14).fill("#f8fafc");
        let xf = M;
        fila.forEach((celda, i) => {
          if (i === 0) doc.fillColor("#0f172a");
          else if (colorFila) doc.fillColor(colorFila(idx));
          doc.text(celda ?? "", xf + 4, yf + 3.5, { width: anchos[i]! - 8, ellipsis: true, lineBreak: false });
          xf += anchos[i]!;
        });
        doc.fillColor("#0f172a");
        doc.y = yf + 14;
      });
      doc.moveDown(0.4);
    };

    // ── 1. Indicadores ────────────────────────────────────────────────────────
    seccion("1. Indicadores consolidados");

    const k = datos.kpis;
    const cajas: Array<[string, string]> = [
      ["Total titulados", String(k.totalTitulados)],
      ["Empleabilidad titulados", `${k.tasaEmpleabilidadTitulados.toFixed(1)} %`],
      ["Egreso → título (prom.)", `${k.tiempoPromedioEgresoTitulacion.toFixed(1)} meses`],
      ["Inserción laboral tit.", `${k.tiempoPromedioInsercionTitulados.toFixed(1)} meses`],
      ["Empleo en Estadística", `${k.porcentajeEmpleoEstadistica.toFixed(1)} %`],
      ["Total egresados", String(k.totalEgresados)],
      ["Empleabilidad egresados", `${k.tasaEmpleabilidadEgresados.toFixed(1)} %`],
      ["Inserción laboral egres.", `${k.tiempoPromedioInsercionEgresados.toFixed(1)} meses`],
    ];

    const anchoCaja = (ANCHO - 12) / 4;
    cajas.forEach(([titulo, valor], i) => {
      const col = i % 4;
      const fila = Math.floor(i / 4);
      const x = M + col * (anchoCaja + 4);
      const y = doc.y + fila * 42;
      doc.rect(x, y, anchoCaja, 36).fill("#f8fafc").lineWidth(0.5).strokeColor("#cbd5e1").stroke();
      doc.fillColor(GRIS).fontSize(7).font("Helvetica-Bold")
         .text(titulo.toUpperCase(), x + 6, y + 6, { width: anchoCaja - 12 });
      doc.fillColor(AZUL).fontSize(14).font("Helvetica-Bold")
         .text(valor, x + 6, y + 18, { width: anchoCaja - 12 });
    });
    doc.y += 42 * Math.ceil(cajas.length / 4) + 6;
    doc.fontSize(7).fillColor(GRIS)
       .text(
         "Empleabilidad = employedor independiente sobre el total del grupo. Tiempo de inserción = meses hasta el primer empleo.",
         M, doc.y, { align: "left" }
       );
    doc.font("Helvetica").fillColor("#0f172a");

    // ── 2. Titulados por año ──────────────────────────────────────────────────
    if (datos.porAnio.length) {
      seccion("2. Distribución por año de egreso / titulación");
      const max = Math.max(...datos.porAnio.map((a) => a.titulados + a.egresados), 1);
      tabla(
        ["Año", "Titulados", "Egresados", "Total", "Distribución"],
        [50, 60, 60, 50, ANCHO - 220],
        datos.porAnio.map((a) => [
          String(a.anio),
          String(a.titulados),
          String(a.egresados),
          String(a.titulados + a.egresados),
          " ",
        ])
      );
      // Redibujar las barras encima de la última columna.
      const inicioBarras = doc.y - datos.porAnio.length * 14 - 6;
      let yb = inicioBarras + 20;
      for (const a of datos.porAnio) {
        const total = a.titulados + a.egresados;
        const x = M + 50 + 60 + 60 + 50 + 4;
        const w = ANCHO - 220 - 8;
        barra(doc, x, yb + 2, w, 9, total / max, AZUL);
        doc.fillColor("#475569").fontSize(7)
           .text(`${((total / max) * 100).toFixed(0)}%`, x + w + 2, yb + 2);
        yb += 14;
      }
      doc.y = yb + 8;
    }

    // ── 3. Sector laboral ─────────────────────────────────────────────────────
    const sectores = datos.vista === "EGRESADOS" ? datos.sectoresEgresados : datos.sectoresTitulados;
    if (sectores.length) {
      seccion(`3. Distribución por sector laboral (${datos.vista === "EGRESADOS" ? "egresados" : "titulados"})`);
      const totalSector = sectores.reduce((a, s) => a + s.valor, 0) || 1;
      tabla(
        ["Sector", "Registros", "%", "Distribución"],
        [ANCHO - 250, 70, 50, 130],
        sectores.map((s) => [s.name, String(s.valor), `${((s.valor / totalSector) * 100).toFixed(1)} %`, " "])
      );
      const y0 = doc.y - sectores.length * 14 - 6;
      let y = y0 + 20;
      for (const s of sectores) {
        barra(doc, M + ANCHO - 250 + 70 + 50 + 6, y + 2, 118, 9, s.valor / totalSector, VERDE);
        y += 14;
      }
      doc.y = y + 8;
    }

    // ── 4. Geografía ──────────────────────────────────────────────────────────
    const geo = datos.vista === "EGRESADOS" ? datos.geografiaEgresados : datos.geografiaTitulados;
    if (geo.length) {
      seccion("4. Distribución geográfica");
      const totalGeo = geo.reduce((a, g) => a + g.total, 0) || 1;
      tabla(
        ["Ciudad / región / país", "Registros", "%"],
        [ANCHO - 180, 90, 90],
        geo.map((g) => [g.ciudad, String(g.total), `${((g.total / totalGeo) * 100).toFixed(1)} %`])
      );
    }

    // ── 5. Cohortes ───────────────────────────────────────────────────────────
    if (datos.cohortes.length && datos.vista !== "EGRESADOS") {
      seccion("5. Cohortes de ingreso: titulados vs. egresados");
      tabla(
        ["Cohorte", "Titulados", "Egresados", "Total", "% titulación"],
        [90, 70, 70, 60, ANCHO - 290],
        datos.cohortes.map((c) => [
          c.cohorte,
          String(c.titulados),
          String(c.egresados),
          String(c.total),
          c.total > 0 ? `${((c.titulados / c.total) * 100).toFixed(1)} %` : "—",
        ])
      );
    }

    // ── 6. Modalidades y motivos ──────────────────────────────────────────────
    if (datos.modalidades.length && datos.vista !== "EGRESADOS") {
      seccion("6. Modalidades de titulación");
      const total = datos.modalidades.reduce((a, m) => a + m.total, 0) || 1;
      tabla(
        ["Modalidad", "Titulados", "%"],
        [ANCHO - 200, 100, 100],
        datos.modalidades.map((m) => [
          m.modalidad,
          String(m.total),
          `${((m.total / total) * 100).toFixed(1)} %`,
        ])
      );
    }

    if (datos.motivos.length && datos.vista !== "TITULADOS") {
      seccion("Motivos de no titulación (egresados)");
      const total = datos.motivos.reduce((a, m) => a + m.total, 0) || 1;
      tabla(
        ["Motivo", "Egresados", "%"],
        [ANCHO - 200, 100, 100],
        datos.motivos.map((m) => [
          etiqueta(m.motivo, ETIQUETAS),
          String(m.total),
          `${((m.total / total) * 100).toFixed(1)} %`,
        ])
      );
    }

    // ── 7. Detalle de registros ───────────────────────────────────────────────
    if (datos.personas.length) {
      seccion("7. Detalle de registros");
      tabla(
        ["N°", "Cédula", "Nombre y apellidos", "Tipo", "Año", "Modalidad / Sector", "Ciudad"],
        [28, 58, ANCHO - 336, 55, 38, 78, 79],
        datos.personas.slice(0, 600).map((p, i) => [
          String(i + 1),
          String(p.cedulaIdentidad ?? ""),
          String(p.nombresApellidos ?? ""),
          etiqueta(p.tipo, ETIQUETAS),
          String(p.anioTitulacion ?? p.anioEgreso ?? "—"),
          String(p.modalidadTitulacion ?? etiqueta(p.sectorTrabajo, ETIQUETAS) ?? "—"),
          String(p.ciudadRegionTrabajo ?? "—"),
        ]),
        () => GRIS
      );
      if (datos.personas.length > 600) {
        doc.fillColor(GRIS).fontSize(8).text(
          `Se muestran los primeros 600 registros de ${datos.personas.length}. Para el detalle completo use la exportación a Excel.`,
          M, doc.y, { align: "left" }
        );
        doc.fillColor("#0f172a");
      }
    }

    // ── Pie de página ─────────────────────────────────────────────────────────
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      const yPie = doc.page.height - 34;
      doc.rect(0, yPie, doc.page.width, 34).fill("#f1f5f9");
      doc.fillColor(GRIS).fontSize(7)
         .text("Sistema de Seguimiento a Titulados y Egresados · Carrera de Estadística · UMSA", M, yPie + 8);
      doc.text(`Página ${i + 1} de ${rango.count}`, M, yPie + 8, { width: ANCHO, align: "right" });
      doc.text(`Generado el ${fecha}`, M, yPie + 18, { width: ANCHO, align: "right" });
    }

    doc.fillColor(AMBAR).fontSize(7).text(
      "Documento generado automáticamente desde la base de datos del sistema. Los indicadores se calculan sobre los registros vigentes al momento de la emisión.",
      M, doc.y + 8, { align: "left" }
    );

    doc.end();
  });
}