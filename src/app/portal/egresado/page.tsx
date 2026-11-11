"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { validarSectorOtro } from "@/lib/sectorOtro";
import AvisoProteccionDatos from "@/components/AvisoProteccionDatos";

interface SolicitudPropia {
  id: number;
  estado: string;
  fechaSolicitud: string;
  fechaRevision: string | null;
  detalle: string | null;
}

export default function EgresadoPortal() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [planea, setPlanea] = useState<string>("");
  const [inicio, setInicio] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // Consentimiento expreso: sin marcar esta casilla el servidor rechaza el guardado.
  const [msg, setMsg] = useState("");
  const [sector, setSector] = useState<string>("");
  const [otroSector, setOtroSector] = useState<string>("");
  const [otroError, setOtroError] = useState<string>("");
  const [yaSeTitulado, setYaSeTitulado] = useState("");
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudPropia[]>([]);
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [mensajeSolicitud, setMensajeSolicitud] = useState("");
  const inputArchivos = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.rol !== "EGRESADO" && user.rol !== "admin") router.push("/login");
  }, [loading, user]);

  useEffect(() => {
    if (user?.ci) fetch(`/api/personas?ci=${encodeURIComponent(user.ci)}`).then(r=>r.json()).then(d=>{ setData(d); setPlanea(d.planeaTitularse||""); setInicio(d.inicioProcesoTitulacion||""); setSector(d.sectorTrabajo||""); setOtroSector(d.sectorTrabajoOtro||""); }).catch(()=>{});
  }, [user]);

  useEffect(() => {
    if (!user?.ci) return;
    fetch("/api/solicitudes", { cache: "no-store" }).then(async (response) => {
      const rows = await response.json();
      if (response.ok && Array.isArray(rows)) setSolicitudes(rows);
    }).catch(() => {});
  }, [user?.ci]);

  if (loading || !data) return <div className="max-w-3xl mx-auto p-6 text-sm">Cargando formulario egresado...</div>;
  if (data.tipo !== "EGRESADO") return <div className="max-w-3xl mx-auto p-6 text-sm text-red-600">Esta cuenta no es de egresado (tipo={data.tipo}). Use CI 8341920.</div>;

  // Lógica pdf_extracted: Planea titularse? SI -> muestra inicio proceso SI, otro caso Planea SI + inicio NO -> muestra motivo, Planea NO/NO_SABE -> muestra motivo
  const showInicio = planea === "SI";
  const showMotivo = (planea === "SI" && inicio === "NO") || planea === "NO" || planea === "NO_SABE";

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: any = {};
    ["correoElectronico","telefono","redesSociales","ciudadRegionTrabajo","estadoLaboral","sectorTrabajo","ocupacionCargo","observaciones","tiempoInsercionLaboralMeses"].forEach(k=> payload[k]=fd.get(k));
    // El sector "--" (vacío) no debe bloquear el guardado: se envía como null.
    if (payload.sectorTrabajo === "") payload.sectorTrabajo = null;
    payload.trabajaEnEstadistica = fd.get("trabajaEnEstadistica")==="SI";
    if (fd.get("sectorTrabajo") === "OTRO") {
      // Si escribió algo se valida (palabra coherente); si está vacío solo se envía OTRO
      const err = validarSectorOtro(otroSector);
      if (err) { setOtroError(err); return; }
      payload.sectorTrabajoOtro = otroSector.trim() || null;
    } else payload.sectorTrabajoOtro = null;
    payload.planeaTitularse = fd.get("planeaTitularse") || null;
    if (showInicio) payload.inicioProcesoTitulacion = fd.get("inicioProcesoTitulacion") || null; else payload.inicioProcesoTitulacion = null;
    if (showMotivo) payload.motivoNoTitulacion = fd.get("motivoNoTitulacion") || null; else payload.motivoNoTitulacion = null;
    setSaving(true); setMsg("");
    const res = await fetch(`/api/personas?ci=${encodeURIComponent(user!.ci)}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)});
    const j = await res.json();
    setSaving(false);
    if (res.ok) { setData(j); setMsg("Guardado correctamente"); } else setMsg(j.error||"Error");
  };

  const agregarArchivos = (lista: FileList | File[]) => {
    const nuevos = Array.from(lista);
    if (documentos.length + nuevos.length > 5) { setMensajeSolicitud("Puedes adjuntar hasta 5 documentos."); return; }
    const permitidos = ["application/pdf", "image/png", "image/jpeg"];
    const extensionValida = (file: File) => /\.(pdf|png|jpe?g)$/i.test(file.name);
    const invalido = nuevos.find((file) => file.size > 10 * 1024 * 1024 || (!permitidos.includes(file.type) && !extensionValida(file)));
    if (invalido) { setMensajeSolicitud(`${invalido.name}: usa PDF, PNG o JPEG de hasta 10 MB.`); return; }
    setDocumentos((actuales) => [...actuales, ...nuevos]);
    setMensajeSolicitud("");
  };

  const enviarSolicitud = async () => {
    if (yaSeTitulado !== "SI") { setMensajeSolicitud("Confirma que ya te titulaste para iniciar el trámite."); return; }
    if (!documentos.length) { setMensajeSolicitud("Adjunta al menos un documento."); return; }
    setEnviandoSolicitud(true);
    setMensajeSolicitud("");
    try {
      const form = new FormData();
      form.set("yaTeTitulado", "SI");
      documentos.forEach((file) => form.append("documentos", file));
      const response = await fetch("/api/solicitudes", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo enviar la solicitud");
      setSolicitudes((actuales) => [{ ...result, fechaRevision: null, detalle: null }, ...actuales]);
      setDocumentos([]);
      if (inputArchivos.current) inputArchivos.current.value = "";
      setMensajeSolicitud("Solicitud enviada a Kardex para revisión.");
    } catch (error) {
      setMensajeSolicitud(error instanceof Error ? error.message : "No se pudo enviar la solicitud.");
    } finally {
      setEnviandoSolicitud(false);
    }
  };

  const input = "w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100";
  const lbl = "text-xs font-bold text-slate-700 dark:text-slate-300";
  const K = "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border-slate-200 dark:border-slate-700";
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-3 text-xs">
        <div><b>Formulario Egresado</b></div>
        <div className="flex items-center gap-2">
          <a href="/kpis/egresados" className="font-bold text-amber-800 dark:text-amber-300 hover:underline inline-flex items-center gap-1">
            📊 Ver Indicadores y Gráficos de Egresados →
          </a>
        </div>
      </div>
      {/* El aviso va ANTES de los campos: informar después de que la persona ya entregó
          sus datos no cumple el deber de información previa del Art. 22.f de la Ley 1405. */}
      <AvisoProteccionDatos />
      <form onSubmit={onSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="font-black text-lg text-slate-900 dark:text-white">Registro de Egresado — {data.nombresApellidos}</h1>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={lbl}>Nombres y apellidos<input value={data.nombresApellidos} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Cédula<input value={data.cedulaIdentidad} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Género<input value={data.genero} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
          <label className={lbl}>Semestre egreso<input value={data.semestreEgreso||""} disabled className={`w-full mt-1 border rounded-lg px-2 py-2 text-sm ${K}`} /></label>
        </div>
        
        <hr className="border-slate-200 dark:border-slate-800" />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={lbl}>Correo<input name="correoElectronico" defaultValue={data.correoElectronico||""} className={input} /></label>
          <label className={lbl}>Teléfono<input name="telefono" defaultValue={data.telefono||""} className={input} /></label>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Facebook / LinkedIn<input name="redesSociales" defaultValue={data.redesSociales||""} className={input} /></label>
          <label className={lbl}>Estado laboral<select name="estadoLaboral" defaultValue={data.estadoLaboral||"DESEMPLEADO"} className={input}><option value="EMPLEADO">Empleado</option><option value="DESEMPLEADO">Desempleado</option><option value="INDEPENDIENTE">Independiente</option></select></label>
          <div>
            <label className={lbl}>Sector<select name="sectorTrabajo" value={sector} onChange={(e)=>setSector(e.target.value)} className={input}><option value="">--</option><option value="PUBLICO">Público</option><option value="PRIVADO">Privado</option><option value="ACADEMICO">Académico</option><option value="ONG">ONG</option><option value="OTRO">Otro</option></select></label>
            {sector === "OTRO" && (
              <label className={`${lbl} mt-3 block`}>Especifique el sector (Otro)<input name="sectorTrabajoOtro" value={otroSector} onChange={(e)=>{ setOtroSector(e.target.value); setOtroError(""); }} placeholder="Ej. Gobierno municipal, organismo internacional, consultora..." className={`${input} ${otroError ? "border-red-500 focus:ring-2 focus:ring-red-600" : ""}`} />
                {otroError && <span className="mt-1.5 block text-[11px] font-bold text-red-600 dark:text-red-400">⚠ {otroError}</span>}
                <span className="mt-1 block text-[10px] text-slate-400">Si deja vac&iacute;o este campo, solo se registrar&aacute; la opci&oacute;n &quot;Otro&quot;.</span>
              </label>
            )}
          </div>
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Ocupación / cargo<input name="ocupacionCargo" defaultValue={data.ocupacionCargo||""} className={input} /></label>
          <label className={lbl}>Ciudad / región<input name="ciudadRegionTrabajo" defaultValue={data.ciudadRegionTrabajo||""} className={input} /></label>
          <label className={lbl}>Trabaja en Estadística<select name="trabajaEnEstadistica" defaultValue={data.trabajaEnEstadistica?"SI":"NO"} className={input}><option value="SI">Sí</option><option value="NO">No</option></select></label>
          <label className={lbl}>Tiempo inserción (meses)<input name="tiempoInsercionLaboralMeses" type="number" defaultValue={data.tiempoInsercionLaboralMeses||""} className={input} /></label>
        </div>
        {/* Bloque condicional egresado */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <label className={lbl}>¿Planea titularse? *<select name="planeaTitularse" value={planea} onChange={e=>setPlanea(e.target.value)} className="w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"><option value="">Seleccione</option><option value="SI">Sí</option><option value="NO">No</option><option value="NO_SABE">No sabe</option></select></label>
            {showInicio && (
              <label className={lbl}>¿Inició proceso de titulación? *<select name="inicioProcesoTitulacion" value={inicio} onChange={e=>setInicio(e.target.value)} className="w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"><option value="">Seleccione</option><option value="SI">Sí</option><option value="NO">No</option></select></label>
            )}
            {showMotivo && (
              <label className={lbl}>Motivo de no titulación *<select name="motivoNoTitulacion" defaultValue={data.motivoNoTitulacion||""} className="w-full mt-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"><option value="">Seleccione</option><option value="LABORAL">Laboral</option><option value="ECONOMICO">Económico</option><option value="PERSONAL">Personal</option><option value="EN_PROCESO">En proceso</option><option value="OTRO">Otro</option></select></label>
            )}
          </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-bold sm:col-span-2 text-slate-700 dark:text-slate-300">Ayudanos con tus sugerencias y observaciones sobre la pagina<textarea name="observaciones" defaultValue={data.observaciones||""} rows={3} className={input} /></label>
        </div>
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <label className={lbl}>¿Ya te titulaste?
            <select value={yaSeTitulado} onChange={(event) => { setYaSeTitulado(event.target.value); if (event.target.value !== "SI") { setDocumentos([]); setMensajeSolicitud(""); } }} className={input}>
              <option value="">Seleccione</option><option value="NO">No</option><option value="SI">Sí</option>
            </select>
          </label>
          {yaSeTitulado === "SI" && (
            <div className="mt-4 rounded-lg border-2 border-dashed border-teal-400 bg-teal-50/70 p-4 text-center dark:border-teal-700 dark:bg-slate-900" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); agregarArchivos(event.dataTransfer.files); }}>
              <p className="text-sm font-normal text-slate-700 dark:text-slate-200">Arrastre su documento o elíjalo en el selector de archivos</p>
              <input ref={inputArchivos} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple className="hidden" onChange={(event) => { if (event.target.files) agregarArchivos(event.target.files); }} />
              <button type="button" onClick={() => inputArchivos.current?.click()} className="mt-3 min-h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Elegir archivos</button>
              <p className="mt-2 text-xs font-normal text-slate-500 dark:text-slate-400">PDF, PNG o JPEG · máximo 10 MB por archivo · hasta 5 documentos</p>
              {documentos.length > 0 && <ul className="mt-3 space-y-1 text-left text-sm">{documentos.map((file, index) => <li key={`${file.name}-${index}`} className="flex justify-between gap-3"><span className="truncate">{file.name}</span><button type="button" onClick={() => setDocumentos((actuales) => actuales.filter((_, i) => i !== index))} className="text-red-700 underline">Quitar</button></li>)}</ul>}
              <button type="button" onClick={() => void enviarSolicitud()} disabled={enviandoSolicitud || documentos.length === 0} className="mt-4 min-h-11 rounded-lg bg-amber-500 px-5 text-sm font-bold text-slate-950 disabled:opacity-50">{enviandoSolicitud ? "Enviando..." : "Enviar solicitud de titulación"}</button>
            </div>
          )}
          {mensajeSolicitud && <p role="status" className="mt-3 text-sm font-normal text-teal-800 dark:text-teal-200">{mensajeSolicitud}</p>}
          {solicitudes.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700"><h2 className="text-sm font-semibold">Estado de tus solicitudes</h2><ul className="mt-2 space-y-2">{solicitudes.map((solicitud) => <li key={solicitud.id} className="text-sm font-normal">#{solicitud.id} · {solicitud.estado} · {new Date(solicitud.fechaSolicitud).toLocaleDateString("es-BO")}{solicitud.detalle && <p className="mt-1 text-slate-600 dark:text-slate-300">Motivo: {solicitud.detalle}</p>}</li>)}</ul></div>}
        </section>
        {msg && <div className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}
          
        <button disabled={saving} className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-2.5 font-bold disabled:opacity-50">{saving?"Guardando...":"Guardar cambios"}</button>
      </form>
    </div>
  );
}
