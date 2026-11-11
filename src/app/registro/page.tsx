"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * /registro  ·  Alta pública de egresados (decisión D5, opción B).
 *
 * Es la contraparte de `POST /api/registro`. El formulario pide solo lo que el egresado
 * sabe de sí mismo y lo que la ley exige; el resto lo completa el administrador al
 * validar la solicitud.
 *
 * El registro NO queda activo al enviarlo: nace PENDIENTE, se envía un enlace al correo
 * para verificarlo, y hasta que un administrador lo valida no cuenta en el sistema ni
 * permite iniciar sesión. El mensaje final lo dice con claridad para que nadie crea que
 * con este formulario ya quedó incorporado.
 */

type Resultado =
  | { estado: "enviado"; mensaje: string; enlaceDevuelto: boolean }
  | { estado: "error"; mensaje: string; campos?: Record<string, string[]> };

const inp =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:ring-2 focus:ring-blue-600/40";

const err = "mt-1 text-xs font-semibold text-red-600";

/**
 * Versión del aviso de privacidad. Debe coincidir con `VERSION_AVISO_PRIVACIDAD` en
 * `lib/validaciones.ts`: el servidor rechaza el registro si no coinciden, para que nadie
 * acepte un aviso distinto del que se le mostró.
 */
const VERSION_AVISO = "1.0.0";

export default function PaginaRegistro() {
  const [f, setF] = useState({
    tipo: "EGRESADO",
    nombresApellidos: "",
    cedulaIdentidad: "",
    genero: "PREFIERO_NO_DECIR",
    correoElectronico: "",
    telefono: "",
    semestreIngreso: "",
    semestreEgreso: "",
    anioEgreso: "",
    anioTitulacion: "",
    modalidadTitulacion: "",
  } as Record<string, string>);
  const [planeaTitularse, setPlaneaTitularse] = useState("");
  const [inicioProceso, setInicioProceso] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);

  useEffect(() => {
    document.title = "Registro | Seguimiento a Titulados";
  }, []);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const esTitulado = f.tipo === "TITULADO";
  const pideMotivo =
    !esTitulado &&
    (planeaTitularse === "NO" ||
      planeaTitularse === "NO_SABE" ||
      (planeaTitularse === "SI" && inicioProceso === "NO"));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    // Guarda frente a un envío con Enter desde cualquier campo, que es la forma
    // habitual de saltarse la casilla si el botón está deshabilitado pero no bloqueado.
    if (!acepta) {
      setR({
        estado: "error",
        mensaje: "Debe leer y aceptar el aviso de privacidad para enviar la solicitud.",
        campos: { consentimientoPrivacidad: ["Obligatorio"] },
      });
      return;
    }
    setEnviando(true);
    setR(null);

    // Se manda exactamente lo que el esquema acepta: si el valor de un desplegable está
    // vacío, la clave no viaja, para que el servidor aplique su propia validación.
    const cuerpo: Record<string, unknown> = {
      tipo: f.tipo,
      nombresApellidos: f.nombresApellidos,
      cedulaIdentidad: f.cedulaIdentidad,
      genero: f.genero,
      correoElectronico: f.correoElectronico,
    };
    const opcionales: Array<[string, string]> = [
      ["telefono", f.telefono],
      ["semestreIngreso", f.semestreIngreso],
      ["semestreEgreso", f.semestreEgreso],
      ["anioEgreso", f.anioEgreso],
      ["anioTitulacion", f.anioTitulacion],
      ["modalidadTitulacion", f.modalidadTitulacion],
    ];
    for (const [k, v] of opcionales) if (v) cuerpo[k] = v;

    if (!esTitulado) {
      cuerpo.planeaTitularse = planeaTitularse;
      if (planeaTitularse === "SI" && inicioProceso) cuerpo.inicioProcesoTitulacion = inicioProceso;
      if (pideMotivo && motivo) cuerpo.motivoNoTitulacion = motivo;
    }

    // Consentimiento: viaja como `true` literal y con la versión del aviso mostrado. El
    // servidor no guarda este valor tal cual, sino la constancia (fecha del servidor +
    // versión), pero lo exige para poder rechazar un envío sin consentimiento aunque la
    // validación del cliente se hubiera saltado.
    cuerpo.consentimientoPrivacidad = true;
    cuerpo.versionAvisoPrivacidad = VERSION_AVISO;

    try {
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();

      if (res.ok || res.status === 202) {
        setR({
          estado: "enviado",
          mensaje: data.mensaje ?? "Su solicitud fue registrada.",
          // La API responde igual exista o no la cédula, para no permitir enumerar quién
          // está en el sistema. Solo cuando el registro se acaba de crear y no hay SMTP, la
          // respuesta trae el enlace de verificación; ese es el único caso en el que esta
          // nota del servidor corresponde mostrarse.
          enlaceDevuelto: Boolean(data.enlaceVerificacion),
        });
      } else {
        setR({ estado: "error", mensaje: data.error ?? "No se pudo enviar la solicitud.", campos: data.campos });
      }
    } catch {
      setR({ estado: "error", mensaje: "Error de red. Intente nuevamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12 text-[var(--fg)]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-11 h-11 rounded-xl bg-[var(--nav-bg)] flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-amber-300" />
          </span>
          <div>
            <h1 className="text-xl font-black tracking-tight">Registro de egresados y titulados</h1>
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
              Facultad de Ciencias · Universidad Mayor de San Andrés
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 mb-4 text-sm leading-relaxed">
          <p>
            Complete el formulario para que la Carrera de Estadística lo contacte. Su
            solicitud <strong>no</strong> queda activa al enviarla: primero se verifica su
            correo y después un administrador revisa los datos.
          </p>
        </div>

        {/* ── Aviso de privacidad (ISO/IEC 27701:2025 · Ley 1405 art. 5) ────────
            Va ANTES de los campos y no en un enlace aparte: el aviso de privacidad
            solo informa si se lee antes de entregar los datos. El enlace legal
            completo puede estar al final, pero no puede sustituir a esto. */}
        <section
          aria-labelledby="aviso-titulo"
          className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-6 mb-4 text-sm leading-relaxed"
        >
          <h2 id="aviso-titulo" className="font-black text-base mb-3">
            Aviso de privacidad y consentimiento
          </h2>
          <dl className="space-y-2.5">
            <div>
              <dt className="font-bold inline">Responsable del tratamiento:</dt>{" "}
              <dd className="inline">
                Carrera de Estadística, Facultad de Ciencias, Universidad Mayor de San Andrés.
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">Datos que se recogen:</dt>{" "}
              <dd className="inline">
                nombre, cédula de identidad, género, correo, teléfono, semestre y año de
                ingreso/egreso, situación de titulación, situación laboral, sector, ocupación
                y ciudad donde trabaja. No se recoge información distinta de la necesaria para
                los fines indicados.
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">Finalidad del tratamiento:</dt>{" "}
              <dd className="inline">
                mantener el registro institucional de titulados y egresados, elaborar las
                estadísticas de empleabilidad e inserción laboral de la carrera y mantenerle
                informada sobre actividades de la carrera. Los datos <strong>no</strong> se
                ceden a terceros ni se usan con fines ajenos a estos.
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">Base jurídica:</dt>{" "}
              <dd className="inline">
                su consentimiento expreso, que es la causa que legitimiza el tratamiento.
                Puede revocarlo en cualquier momento desde el portal o escribiendo a la
                Carrera.
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">Conservación:</dt>{" "}
              <dd className="inline">
                mientras figure en el registro institucional de la carrera. Los indicadores
                estadísticos que se publican no identifican personas: los grupos de menos de
                5 egresados no se publican.
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">Sus derechos:</dt>{" "}
              <dd className="inline">
                puede acceder a sus datos, corregirlos, obtener una copia y pedir su
                eliminación escribiendo a la Carrera o desde su cuenta del portal. Puede
                retirar el consentimiento en cualquier momento, sin efectos retroactivos.
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Versión del aviso: {VERSION_AVISO}. Al enviar este formulario se registra su
            aceptación junto con la fecha, la hora y la dirección IP desde la que se envía.
          </p>
        </section>

        {r?.estado === "enviado" && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 mb-6">
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="font-bold">Solicitud recibida</h2>
            </div>
            <p className="text-sm text-emerald-900">{r.mensaje}</p>
            {r.enlaceDevuelto && (
              <p className="text-xs text-emerald-800 mt-3">
                <strong>Nota del servidor:</strong> no hay servicio de correo configurado en
                esta instalación, así que el enlace de verificación se devolvió en la respuesta
                y quedó registrado en la consola del servidor. El flujo completo queda probado,
                pero falta configurar el SMTP para que el correo llegue solo.
              </p>
            )}
          </div>
        )}

        {r?.estado === "error" && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-5 mb-6">
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-bold">No se pudo enviar</h2>
            </div>
            <p className="text-sm text-red-900">{r.mensaje}</p>
            {r.campos && (
              <ul className="mt-2 text-xs text-red-800 space-y-1">
                {Object.entries(r.campos).map(([campo, msgs]) => (
                  <li key={campo}>
                    <b>{campo}:</b> {msgs.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={enviar} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted)]">Datos personales</h2>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide">Nombres y apellidos *</span>
            <input required className={inp} value={f.nombresApellidos} onChange={(e) => set("nombresApellidos", e.target.value)} />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Cédula de identidad *</span>
              <input required placeholder="1234567" className={inp} value={f.cedulaIdentidad} onChange={(e) => set("cedulaIdentidad", e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Correo electrónico *</span>
              <input required type="email" placeholder="nombre@correo.com" className={inp} value={f.correoElectronico} onChange={(e) => set("correoElectronico", e.target.value)} />
              <span className="text-[11px] text-[var(--muted)]">Aquí le enviaremos el enlace de verificación.</span>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Género *</span>
              <select className={inp} value={f.genero} onChange={(e) => set("genero", e.target.value)}>
                <option value="PREFIERO_NO_DECIR">Prefiero no decir</option>
                <option value="MASCULINO">Masculino</option>
                <option value="FEMENINO">Femenino</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Teléfono</span>
              <input className={inp} value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </label>
          </div>

          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted)] pt-2">Situación académica</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">¿Está titulado o es egresado? *</span>
              <select className={inp} value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
                <option value="EGRESADO">Egresado</option>
                <option value="TITULADO">Titulado</option>
              </select>
            </label>
            {esTitulado && (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide">Modalidad de titulación *</span>
                <select className={inp} value={f.modalidadTitulacion} onChange={(e) => set("modalidadTitulacion", e.target.value)}>
                  <option value="">Seleccione…</option>
                  {["Tesis", "Proyecto de grado", "Examen de grado", "Trabajo dirigido", "Otro"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Semestre de ingreso</span>
              <input placeholder="I/2018" className={inp} value={f.semestreIngreso} onChange={(e) => set("semestreIngreso", e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Semestre de egreso</span>
              <input placeholder="II/2023" className={inp} value={f.semestreEgreso} onChange={(e) => set("semestreEgreso", e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Año de egreso</span>
              <input inputMode="numeric" className={inp} value={f.anioEgreso} onChange={(e) => set("anioEgreso", e.target.value)} />
            </label>
          </div>

          {esTitulado && (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide">Año de titulación *</span>
              <input inputMode="numeric" className={inp} value={f.anioTitulacion} onChange={(e) => set("anioTitulacion", e.target.value)} />
            </label>
          )}

          {!esTitulado && (
            <>
              <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted)] pt-2">Titulación</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide">¿Planea titularse? *</span>
                  <select className={inp} value={planeaTitularse} onChange={(e) => setPlaneaTitularse(e.target.value)}>
                    <option value="">Seleccione…</option>
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                    <option value="NO_SABE">No sabe</option>
                  </select>
                </label>
                {planeaTitularse === "SI" && (
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide">¿Ya inició el proceso? *</span>
                    <select className={inp} value={inicioProceso} onChange={(e) => setInicioProceso(e.target.value)}>
                      <option value="">Seleccione…</option>
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                    </select>
                  </label>
                )}
              </div>

              {pideMotivo && (
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide">Motivo de no titulación *</span>
                  <select className={inp} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    <option value="">Seleccione…</option>
                    <option value="LABORAL">Motivo laboral</option>
                    <option value="ECONOMICO">Motivo económico</option>
                    <option value="PERSONAL">Motivo personal</option>
                    <option value="EN_PROCESO">Está en proceso</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </label>
              )}
            </>
          )}

          <label
            className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 cursor-pointer"
          >
            <input
              type="checkbox"
              required
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-800"
            />
            <span className="text-xs leading-relaxed">
              He leído el{" "}
              <strong className="font-bold">aviso de privacidad</strong> y acepto el
              tratamiento de mis datos para los fines indicados en él. Entiendo que puedo
              retirar este consentimiento en cualquier momento.
              {r?.estado === "error" && r.campos?.consentimientoPrivacidad && (
                <span className="block mt-1 font-semibold text-red-600">
                  {r.campos.consentimientoPrivacidad.join(", ")}
                </span>
              )}
            </span>
          </label>

          <button
            type="submit"
            disabled={enviando || !acepta}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-black uppercase tracking-wide text-white bg-[var(--nav-bg)] hover:opacity-90 disabled:opacity-60 transition inline-flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>

          <p className="text-xs text-[var(--muted)]">
            Los campos marcados con * son obligatorios. Si ya está registrado, su solicitud
            no se duplicará: revise el correo de contacto que registró.
          </p>
        </form>
      </div>
    </main>
  );
}