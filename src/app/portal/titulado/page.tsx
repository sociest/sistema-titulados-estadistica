"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { validarSectorOtro } from "@/lib/sectorOtro";
import AvisoProteccionDatos from "@/components/AvisoProteccionDatos";
import { VERSION_AVISO_PRIVACIDAD as VERSION_AVISO } from "@/lib/validaciones";

type CarreraForm = { carrera?: string; universidad?: string; facultad?: string; grados?: string };
const CAMPOS_CARRERA = [
  { id: "UNIVERSIDAD", propiedad: "universidad", etiqueta: "Universidad" },
  { id: "FACULTAD", propiedad: "facultad", etiqueta: "Facultad" },
  { id: "CARRERA", propiedad: "carrera", etiqueta: "Carrera" },
  { id: "GRADO", propiedad: "grados", etiqueta: "Grado" },
] as const;

export default function TituladoPortal() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  // Consentimiento expreso: sin marcar esta casilla el servidor rechaza el guardado.
  const [acepta, setAcepta] = useState(false);
  const [msgConsentimiento, setMsgConsentimiento] = useState("");
  const [msg, setMsg] = useState("");
  const [sector, setSector] = useState<string>("");
  const [otroSector, setOtroSector] = useState<string>("");
  const [otroError, setOtroError] = useState<string>("");
  const [nivelEstudio, setNivelEstudio] = useState("");
  const [cursoReciente, setCursoReciente] = useState("");
  const [ultimoCurso, setUltimoCurso] = useState("");
  const [tieneOtraCarrera, setTieneOtraCarrera] = useState("NO");
  const [seleccionCampos, setSeleccionCampos] = useState<string[]>([]);
  const [camposAplicados, setCamposAplicados] = useState<string[]>([]);
  const [filasCarrera, setFilasCarrera] = useState<CarreraForm[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.rol !== "TITULADO" && user.rol !== "admin") router.push("/login");
  }, [loading, user]);

  useEffect(() => {
    if (!user?.ci) return;
    let activa = true;
    Promise.all([
      fetch(`/api/personas?ci=${encodeURIComponent(user.ci)}`).then((r) => r.json()),
      fetch(`/api/carreras?ci=${encodeURIComponent(user.ci)}`).then((r) => r.ok ? r.json() : []),
    ]).then(([persona, carrerasGuardadas]) => {
      if (!activa) return;
      const carrerasActuales = Array.isArray(carrerasGuardadas) ? carrerasGuardadas as CarreraForm[] : [];
      setData(persona);
      setSector(persona.sectorTrabajo || "");
      setOtroSector(persona.sectorTrabajoOtro || "");
      setNivelEstudio(persona.nivelEstudio || "");
      setCursoReciente(persona.realizoCursoUltimos3Anos === true ? "SI" : persona.realizoCursoUltimos3Anos === false ? "NO" : "");
      setUltimoCurso(persona.ultimoCurso || "");
      setFilasCarrera(carrerasActuales);
      setTieneOtraCarrera(carrerasActuales.length ? "SI" : "NO");
      const visibles = CAMPOS_CARRERA.filter(({ propiedad }) => carrerasActuales.some((row) => row[propiedad]?.trim())).map(({ id }) => id);
      setSeleccionCampos(visibles);
      setCamposAplicados(visibles);
    }).catch(() => {});
    return () => { activa = false; };
  }, [user?.ci]);

  if (loading || !data) return <div className="max-w-3xl mx-auto p-6 text-sm">Cargando formulario titulado...</div>;
  if (data.tipo !== "TITULADO") return <div className="max-w-3xl mx-auto p-6 text-sm text-red-600">Esta cuenta no es de titulado (tipo={data.tipo}). Use CI 6893412.</div>;

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!acepta) { setMsgConsentimiento("Debe aceptar el aviso de privacidad para guardar sus datos"); return; }
    setMsgConsentimiento("");
    const fd = new FormData(e.currentTarget);
    const payload: any = {};
    ["correoElectronico","telefono","redesSociales","ciudadRegionTrabajo","estadoLaboral","sectorTrabajo","ocupacionCargo","observaciones","tiempoInsercionLaboralMeses"].forEach(k=> payload[k]=fd.get(k));
    // El sector "--" (vacío) no debe bloquear el guardado: se envía como null.
    if (payload.sectorTrabajo === "") payload.sectorTrabajo = null;
    payload.consentimientoPrivacidad = true;
    payload.versionAvisoPrivacidad = VERSION_AVISO;
    payload.trabajaEnEstadistica = fd.get("trabajaEnEstadistica")==="SI";
    payload.nivelEstudio = nivelEstudio || null;
    payload.realizoCursoUltimos3Anos = cursoReciente === "" ? null : cursoReciente === "SI";
    payload.ultimoCurso = cursoReciente === "SI" ? ultimoCurso.trim() : null;
    if (fd.get("sectorTrabajo") === "OTRO") {
      // Si escribió algo se valida (palabra coherente); si está vacío solo se envía OTRO
      const err = validarSectorOtro(otroSector);
      if (err) { setOtroError(err); return; }
      payload.sectorTrabajoOtro = otroSector.trim() || null;
    } else payload.sectorTrabajoOtro = null;
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`/api/personas?ci=${encodeURIComponent(user!.ci)}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)});
      const j = await res.json();
      if (!res.ok) { setMsg(j.error || "Error al guardar el perfil"); return; }
      const propiedades = CAMPOS_CARRERA.filter(({ id }) => camposAplicados.includes(id));
      const carreras = tieneOtraCarrera === "SI" && !camposAplicados.includes("NINGUNO")
        ? filasCarrera.map((row) => Object.fromEntries(propiedades.map(({ propiedad }) => [propiedad, row[propiedad] || null])))
        : [];
      const resCarreras = await fetch(`/api/carreras?ci=${encodeURIComponent(user!.ci)}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ carreras }) });
      if (!resCarreras.ok) { const error = await resCarreras.json(); setData(j); setMsg(`Perfil guardado; no se guardaron las carreras: ${error.error || "error"}`); return; }
      setData(j);
      setMsg("Guardado correctamente");
    } catch {
      setMsg("No se pudo conectar con el servidor");
    } finally {
      setSaving(false);
    }
  };

  const cambiarCampoCarrera = (campo: string, marcado: boolean) => {
    setSeleccionCampos((actuales) => {
      if (campo === "NINGUNO") return marcado ? ["NINGUNO"] : [];
      const sinNinguno = actuales.filter((actual) => actual !== "NINGUNO");
      return marcado ? sinNinguno.includes(campo) ? sinNinguno : [...sinNinguno, campo] : sinNinguno.filter((actual) => actual !== campo);
    });
  };

  const aplicarCamposCarrera = () => {
    const seleccionados = [...seleccionCampos];
    setCamposAplicados(seleccionados);
    if (seleccionados.includes("NINGUNO")) {
      setFilasCarrera([]);
      return;
    }
    const activos = CAMPOS_CARRERA.filter(({ id }) => seleccionados.includes(id));
    setFilasCarrera((actuales) => (actuales.length ? actuales : [{}]).map((row) => ({
      carrera: activos.some(({ propiedad }) => propiedad === "carrera") ? row.carrera || "" : undefined,
      universidad: activos.some(({ propiedad }) => propiedad === "universidad") ? row.universidad || "" : undefined,
      facultad: activos.some(({ propiedad }) => propiedad === "facultad") ? row.facultad || "" : undefined,
      grados: activos.some(({ propiedad }) => propiedad === "grados") ? row.grados || "" : undefined,
    })));
  };

  const actualizarCarrera = (indice: number, propiedad: keyof CarreraForm, valor: string) => {
    setFilasCarrera((actuales) => actuales.map((row, i) => i === indice ? { ...row, [propiedad]: valor } : row));
  };

  const input = "w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100";
  const lbl = "text-xs font-bold text-slate-700 dark:text-slate-300";
  const K = "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed border-slate-200 dark:border-slate-700";
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3 text-xs"><b>Formulario Titulado</b></div>
      {/* El aviso va ANTES de los campos: informar después de que la persona ya entregó
          sus datos no cumple el deber de información previa del Art. 22.f de la Ley 1405. */}
      <AvisoProteccionDatos />
      <form onSubmit={onSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="font-black text-lg text-slate-900 dark:text-white">Registro de Titulado — {data.nombresApellidos}</h1>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={lbl}>Nombres y apellidos<input value={data.nombresApellidos} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Cédula de identidad<input value={data.cedulaIdentidad} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Género<input value={data.genero} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Semestre egreso<input value={data.semestreEgreso||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Año titulación<input value={data.anioTitulacion||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Modalidad titulación<input value={data.modalidadTitulacion||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Área especialización<input value={data.areaEspecializacion||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
        </div>
        <hr className="border-slate-200 dark:border-slate-800" />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={lbl}>Correo electrónico<input name="correoElectronico" defaultValue={data.correoElectronico||""} className={input} /></label>
          <label className={lbl}>Teléfono / celular<input name="telefono" defaultValue={data.telefono||""} className={input} /></label>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Facebook / LinkedIn<input name="redesSociales" defaultValue={data.redesSociales||""} placeholder="URL o usuario" className={input} /></label>
          <label className={lbl}>Estado laboral actual<select name="estadoLaboral" defaultValue={data.estadoLaboral||"DESEMPLEADO"} className={input}><option value="EMPLEADO">Empleado</option><option value="DESEMPLEADO">Desempleado</option><option value="INDEPENDIENTE">Independiente</option></select></label>
          <div>
            <label className={lbl}>Sector donde trabaja<select name="sectorTrabajo" value={sector} onChange={(e)=>setSector(e.target.value)} className={input}><option value="">--</option><option value="PUBLICO">Público</option><option value="PRIVADO">Privado</option><option value="ACADEMICO">Académico</option><option value="ONG">ONG</option><option value="OTRO">Otro</option></select></label>
            {sector === "OTRO" && (
              <label className={`${lbl} mt-3 block`}>Especifique el sector (Otro)<input name="sectorTrabajoOtro" value={otroSector} onChange={(e)=>{ setOtroSector(e.target.value); setOtroError(""); }} placeholder="Ej. Gobierno municipal, organismo internacional, consultora..." className={`${input} ${otroError ? "border-red-500 focus:ring-2 focus:ring-red-600" : ""}`} />
                {otroError && <span className="mt-1.5 block text-[11px] font-bold text-red-600 dark:text-red-400">⚠ {otroError}</span>}
                <span className="mt-1 block text-[10px] text-slate-400">Si deja vac&iacute;o este campo, solo se registrar&aacute; la opci&oacute;n &quot;Otro&quot;.</span>
              </label>
            )}
          </div>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Ocupación / cargo actual<input name="ocupacionCargo" defaultValue={data.ocupacionCargo||""} className={input} /></label>
          <label className={lbl}>Ciudad / región donde trabaja<input name="ciudadRegionTrabajo" defaultValue={data.ciudadRegionTrabajo||""} className={input} /></label>
          <label className={lbl}>Trabaja en Estadística<select name="trabajaEnEstadistica" defaultValue={data.trabajaEnEstadistica?"SI":"NO"} className={input}><option value="SI">Sí</option><option value="NO">No</option></select></label>
          <label className={lbl}>Tiempo inserción laboral (meses)<input name="tiempoInsercionLaboralMeses" type="number" defaultValue={data.tiempoInsercionLaboralMeses||""} className={input} /></label>
          <label className={lbl}>Grado
            <select name="nivelEstudio" value={nivelEstudio} onChange={(e)=>setNivelEstudio(e.target.value)} required className={input}>
              <option value="">Seleccione</option>
              <option value="TÉCNICO">TÉCNICO</option>
              <option value="LICENCIATURA">LICENCIATURA</option>
              <option value="LICENCIATURA CON ESPECIALIZACIÓN">LICENCIATURA CON ESPECIALIZACIÓN</option>
              <option value="MAESTRÍA">MAESTRÍA</option>
              <option value="POSGRADO">POSGRADO</option>
            </select>
          </label>
          <label className={lbl}>¿Realizó un curso en los últimos 3 años?
            <select name="realizoCursoUltimos3Anos" value={cursoReciente} onChange={(e)=>setCursoReciente(e.target.value)} required className={input}>
              <option value="">Seleccione</option><option value="SI">Sí</option><option value="NO">No</option>
            </select>
          </label>
          {cursoReciente === "SI" && (
            <label className={`${lbl} sm:col-span-2`}>Nombre del curso
              <input name="ultimoCurso" value={ultimoCurso} onChange={(e)=>setUltimoCurso(e.target.value)} required maxLength={200} className={input} />
            </label>
          )}
          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <label className={lbl}>¿Tiene otra carrera?
              <select value={tieneOtraCarrera} onChange={(e)=>{ setTieneOtraCarrera(e.target.value); if (e.target.value === "NO") { setFilasCarrera([]); setSeleccionCampos([]); setCamposAplicados([]); } }} className={input}>
                <option value="NO">NO</option><option value="SI">SÍ</option>
              </select>
            </label>
            {tieneOtraCarrera === "SI" && (
              <fieldset className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <legend className="px-2 text-sm font-semibold">¿Qué información desea registrar?</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                  {CAMPOS_CARRERA.map(({ id, etiqueta }) => (
                    <label key={id} className="inline-flex items-center gap-2 text-sm font-normal">
                      <input type="checkbox" checked={seleccionCampos.includes(id)} onChange={(e)=>cambiarCampoCarrera(id, e.target.checked)} /> {etiqueta.toUpperCase()}
                    </label>
                  ))}
                  <label className="inline-flex items-center gap-2 text-sm font-normal">
                    <input type="checkbox" checked={seleccionCampos.includes("NINGUNO")} onChange={(e)=>cambiarCampoCarrera("NINGUNO", e.target.checked)} /> NINGUNO
                  </label>
                </div>
                <button type="button" onClick={aplicarCamposCarrera} className="mt-4 min-h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Aplicar</button>
                {camposAplicados.includes("NINGUNO") && <p className="mt-3 text-sm font-normal text-slate-600 dark:text-slate-300">No se registrarán datos de otra carrera.</p>}
                {camposAplicados.length > 0 && !camposAplicados.includes("NINGUNO") && (
                  <div className="mt-4 space-y-4">
                    {filasCarrera.map((row, indice) => (
                      <div key={indice} className="grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:grid-cols-2">
                        {CAMPOS_CARRERA.filter(({ id }) => camposAplicados.includes(id)).map(({ id, propiedad, etiqueta }) => (
                          <label key={id} className={lbl}>{etiqueta}
                            <input value={row[propiedad] || ""} onChange={(e)=>actualizarCarrera(indice, propiedad, e.target.value)} maxLength={200} className={input} />
                          </label>
                        ))}
                      </div>
                    ))}
                    {filasCarrera.length < 20 && <button type="button" onClick={()=>setFilasCarrera((actuales)=>[...actuales, {}])} className="min-h-10 rounded-lg border border-teal-700 px-4 text-sm font-semibold text-teal-800 dark:text-teal-200">Agregar otra carrera</button>}
                  </div>
                )}
              </fieldset>
            )}
          </div>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Ayudanos con tus sugerencias y observaciones sobre la pagina<textarea name="observaciones" defaultValue={data.observaciones||""} rows={3} className={input} /></label>
        </div>
        {msg && <div className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">{msg}</div>}
          <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 cursor-pointer sm:col-span-2">
            <input
              type="checkbox"
              name="consentimientoPrivacidad"
              required
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-800"
            />
            <span className="text-xs leading-relaxed">
              He leido el <strong className="font-bold">aviso de privacidad</strong> y
              acepto el tratamiento de mis datos para los fines indicados en el Art. 5
              de la Ley N. 1405. Entiendo que puedo retirar este consentimiento en
              cualquier momento.
              {msgConsentimiento && (
                <span className="block mt-1 font-semibold text-red-600">{msgConsentimiento}</span>
              )}
            </span>
          </label>
        <button disabled={saving} className="w-full bg-blue-900 hover:bg-blue-800 text-white rounded-xl py-2.5 font-bold disabled:opacity-50">{saving?"Guardando...":"Guardar cambios"}</button>
      </form>
    </div>
  );
}
