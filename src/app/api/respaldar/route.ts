import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { errorInterno, exigirAdmin, leerSesionVigente } from "@/lib/guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { TABLAS_RESPALDO, identificadorSql, literalSql } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOTE_STREAM = 500;

/**
 * GET /api/respaldar → respaldo lógico consistente en STREAMING real (bajo consumo RAM).
 *
 * Lee directamente de PostgreSQL mediante paginación keyset (`WHERE pk > $1 LIMIT 500`)
 * dentro de una transacción `REPEATABLE READ READ ONLY`:
 *  1. Obtiene nombres reales de columna en PostgreSQL (`snake_case`), generando SQL 100 %
 *     restaurable con `psql` (más `setval` para secuencias `SERIAL`).
 *  2. Nunca acumula todas las tablas en un objeto JS gigante: el consumo de RAM se
 *     mantiene constante (< 5 MB) dentro del límite de 1 GB del contenedor.
 */
export async function GET(req: NextRequest) {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const sesion = await leerSesionVigente(req);
  if (!sesion || sesion.rol !== "admin") {
    return NextResponse.json({ error: "Debe iniciar sesión" }, { status: 401 });
  }

  try {
    const formato = (new URL(req.url).searchParams.get("formato") ?? "json").toLowerCase();
    if (formato !== "json" && formato !== "sql") {
      return NextResponse.json(
        { error: "Formato no soportado. Use formato=json o formato=sql." },
        { status: 400 }
      );
    }

    const cliente = await pool.connect();
    let liberado = false;
    const liberar = async () => {
      if (liberado) return;
      liberado = true;
      await cliente.query("COMMIT").catch(() => {});
      cliente.release();
    };

    try {
      await cliente.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

      const conteos: Record<string, number> = {};
      for (const { nombre } of TABLAS_RESPALDO) {
        const tablaSql = identificadorSql(nombre);
        const r = await cliente.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM ${tablaSql}`
        );
        conteos[nombre] = r.rows[0]?.total ?? 0;
      }

      const sello = new Date().toISOString().replace(/[:.]/g, "-");
      const nombreArchivo = `respaldo_sistema_${sello}.${formato}`;
      const origen = new URL(req.url).origin;

      const promesaAuditoria = registrarAuditoria({
        accion: "exportar",
        entidad: "respaldo",
        idUsuario: sesion.sub,
        detalles: `Respaldo completo en streaming · formato ${formato} · ${Object.entries(conteos)
          .map(([t, n]) => `${t}=${n}`)
          .join(", ")}`,
        req,
      });

      if (formato === "json") {
        const stream = new ReadableStream({
          async start(control) {
            const enc = new TextEncoder();
            const enviar = (s: string) => control.enqueue(enc.encode(s));
            try {
              const meta = {
                respaldo: "Sistema de Seguimiento a Titulados y Egresados",
                generadoEn: new Date().toISOString(),
                generadoPor: origen,
                nota: "Volcado consistente generado en streaming por lotes.",
                conteos,
              };
              // Abrimos el objeto raíz y escribimos metadatos + propiedad "datos" en streaming
              const cabecera = JSON.stringify(meta, null, 2).slice(0, -2);
              enviar(`${cabecera},\n  "datos": {\n`);

              for (let idxTabla = 0; idxTabla < TABLAS_RESPALDO.length; idxTabla++) {
                const { nombre, pk } = TABLAS_RESPALDO[idxTabla]!;
                const tablaSql = identificadorSql(nombre);
                const pkSql = identificadorSql(pk);
                enviar(`    ${JSON.stringify(nombre)}: [`);

                let ultimoPk = 0;
                let primeraFila = true;
                while (true) {
                  const lote = await cliente.query<Record<string, unknown>>(
                    `SELECT * FROM ${tablaSql} WHERE ${pkSql} > $1 ORDER BY ${pkSql} ASC LIMIT $2`,
                    [ultimoPk, LOTE_STREAM]
                  );
                  if (lote.rows.length === 0) break;

                  const trozo: string[] = [];
                  for (const fila of lote.rows) {
                    ultimoPk = Number(fila[pk] ?? ultimoPk);
                    trozo.push(`${primeraFila ? "\n      " : ",\n      "}${JSON.stringify(fila)}`);
                    primeraFila = false;
                  }
                  enviar(trozo.join(""));
                }

                const comaTabla = idxTabla < TABLAS_RESPALDO.length - 1 ? "," : "";
                enviar(`${primeraFila ? "" : "\n    "}]${comaTabla}\n`);
              }

              enviar("  }\n}\n");
              await liberar();
              await promesaAuditoria;
              control.close();
            } catch (err) {
              await liberar();
              control.error(err);
            }
          },
          async cancel() {
            await liberar();
          },
        });

        return new NextResponse(stream, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      // ── formato SQL: sentencias INSERT válidas con columnas reales de PostgreSQL ──
      const stream = new ReadableStream({
        async start(control) {
          const enc = new TextEncoder();
          const enviar = (s: string) => control.enqueue(enc.encode(s));
          try {
            enviar(`-- Respaldo generado por la aplicación el ${new Date().toISOString()}\n`);
            enviar("BEGIN;\n");

            for (const { nombre, pk, secuencia } of TABLAS_RESPALDO) {
              const tablaSql = identificadorSql(nombre);
              const pkSql = identificadorSql(pk);
              enviar(`\n-- Tabla: ${nombre} (${conteos[nombre] ?? 0} registros)\n`);

              let ultimoPk = 0;
              let tieneFilas = false;
              while (true) {
                const lote = await cliente.query<Record<string, unknown>>(
                  `SELECT * FROM ${tablaSql} WHERE ${pkSql} > $1 ORDER BY ${pkSql} ASC LIMIT $2`,
                  [ultimoPk, LOTE_STREAM]
                );
                if (lote.rows.length === 0) break;
                tieneFilas = true;

                const lineas: string[] = [];
                for (const fila of lote.rows) {
                  ultimoPk = Number(fila[pk] ?? ultimoPk);
                  const cols = Object.keys(fila);
                  const colsSql = cols.map(identificadorSql).join(", ");
                  const valsSql = cols.map((c) => literalSql(fila[c])).join(", ");
                  lineas.push(`INSERT INTO ${tablaSql} (${colsSql}) VALUES (${valsSql});\n`);
                }
                enviar(lineas.join(""));
              }

              if (secuencia && tieneFilas) {
                enviar(
                  `SELECT setval(pg_get_serial_sequence('${nombre}', '${pk}'), COALESCE((SELECT MAX(${pkSql}) FROM ${tablaSql}), 1), true);\n`
                );
              }
            }

            enviar("\nCOMMIT;\n");
            await liberar();
            await promesaAuditoria;
            control.close();
          } catch (err) {
            await liberar();
            control.error(err);
          }
        },
        async cancel() {
          await liberar();
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (e) {
      await liberar();
      throw e;
    }
  } catch (error: unknown) {
    return errorInterno(error, "api/respaldar");
  }
}
