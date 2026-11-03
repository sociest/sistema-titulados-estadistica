"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Loader2, CheckCircle2, AlertTriangle,
  UserPlus, Users, ShieldCheck, KeyRound, EyeOff,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import LoadingOverlay from "@/components/LoadingOverlay";

/**
 * Gestión de usuarios administradores (PDF 4.2: "alta, baja, cambio de contraseña").
 *
 * Antes no existía: la tabla `usuarios` estaba vacía y el acceso admin dependía de un
 * fallback hardcodeado en el login. Aquí se da de alta, edita, bloquea y elimina usuarios,
 * y se cambian contraseñas. Los hashes nunca se muestran.
 */

interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  ci: string | null;
  rol: "admin" | "KARDEX";
  estado: "activo" | "inactivo" | "bloqueado";
  creadoEn: string;
  ultimoAcceso: string | null;
}

const inp =
  "mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600";
const errMsg = "block mt-1 text-[11px] font-bold text-red-600 dark:text-red-400";

const COLOR_ESTADO: Record<string, string> = {
  activo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  inactivo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  bloqueado: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function AdminUsuariosPage() {
  const { user, loading: authLoading } = useAuth();

  const [filas, setFilas] = useState<Usuario[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<"cerrado" | "nuevo" | "editar" | "password" | "borrar">("cerrado");
  const [editando, setEditando] = useState<Usuario | null>(null);

  const [form, setForm] = useState({
    nombre: "", correo: "", ci: "", rol: "admin", estado: "activo", password: "",
  });
  const [passwordActual, setPasswordActual] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [campoError, setCampoError] = useState<Record<string, string[]>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/usuarios");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al cargar");
      setFilas(j.filas);
    } catch (e: any) {
      setMsg({ tipo: "error", texto: e.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { if (user?.rol === "admin") cargar(); }, [user, cargar]);

  const abrirNuevo = () => {
    setForm({ nombre: "", correo: "", ci: "", rol: "admin", estado: "activo", password: "" });
    setEditando(null); setCampoError({}); setMsg(null); setModal("nuevo");
  };

  const abrirEditar = (u: Usuario) => {
    setForm({ nombre: u.nombre, correo: u.correo, ci: u.ci ?? "", rol: u.rol, estado: u.estado, password: "" });
    setEditando(u); setCampoError({}); setMsg(null); setModal("editar");
  };

  const enviar = async () => {
    setGuardando(true); setMsg(null); setCampoError({});
    try {
      const esNuevo = modal === "nuevo";
      const url = esNuevo ? "/api/usuarios" : `/api/usuarios/${editando!.id}`;
      const cuerpo: Record<string, unknown> = {
        nombre: form.nombre, correo: form.correo, ci: form.ci || null,
        rol: form.rol, estado: form.estado,
      };
      if (esNuevo || form.password) cuerpo.password = form.password;

      const res = await fetch(url, {
        method: esNuevo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await res.json();
      if (!res.ok) { setCampoError(j.campos ?? {}); setMsg({ tipo: "error", texto: j.error ?? "No se pudo guardar" }); return; }
      setModal("cerrado"); await cargar();
    } catch { setMsg({ tipo: "error", texto: "Error de red." }); }
    finally { setGuardando(false); }
  };

  const cambiarPassword = async () => {
    if (!editando) return;
    setGuardando(true); setMsg(null);
    try {
      const res = await fetch(`/api/usuarios/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.password, passwordActual }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ tipo: "error", texto: j.error ?? "No se pudo cambiar" }); return; }
      setModal("cerrado"); setForm((f) => ({ ...f, password: "" })); setPasswordActual("");
      await cargar();
    } catch { setMsg({ tipo: "error", texto: "Error de red." }); }
    finally { setGuardando(false); }
  };

  const eliminar = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/usuarios/${editando.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo eliminar");
      setModal("cerrado"); await cargar();
    } catch (e: any) { setMsg({ tipo: "error", texto: e.message }); }
    finally { setGuardando(false); }
  };

  if (authLoading) return <div className="p-8 text-sm text-slate-500">Verificando sesión…</div>;
  if (!user || user.rol !== "admin") return null;

  const err = (k: string) => campoError[k]?.[0];

  return (
    <>
      <LoadingOverlay visible={guardando} icon={<Loader2 className="w-7 h-7 animate-spin" />} title="Guardando" label="Usuario" />

      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm font-bold px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Usuarios del sistema
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Acceso al sistema · Módulo 4.2 de la especificación
              </p>
            </div>
          </div>
          <button onClick={abrirNuevo} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition">
            <UserPlus className="w-4 h-4" /> Nuevo usuario
          </button>
        </div>

        {msg && !modal && (
          <div className="text-xs px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
            {msg.texto}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Último acceso</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cargando && filas === null && (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400">Cargando…</td></tr>
                )}
                {filas?.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400">
                    No hay usuarios registrados.
                  </td></tr>
                )}
                {filas?.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{u.nombre}</p>
                      <p className="text-[11px] text-slate-500">{u.correo}{u.ci ? ` · CI ${u.ci}` : ""}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {u.rol}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${COLOR_ESTADO[u.estado]}`}>
                        {u.estado}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {u.ultimoAcceso ? new Date(u.ultimoAcceso).toLocaleString("es-BO") : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(u)} title="Editar"
                          className="p-2 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditando(u); setForm((f) => ({ ...f, password: "" })); setPasswordActual(""); setMsg(null); setModal("password"); }} title="Cambiar contraseña"
                          className="p-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 rounded-lg transition">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button onClick={() => { setEditando(u); setMsg(null); setModal("borrar"); }} title="Eliminar"
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Las contraseñas se guardan cifradas con <b>scrypt</b> y nunca se muestran ni se envían
            al navegador. Si un usuario tiene CI registrada, esa persona también podrá entrar al
            sistema con su cédula y contraseña.
          </p>
        </div>
      </div>

      {/* Modales */}
      {(modal === "nuevo" || modal === "editar") && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-black text-base text-slate-900 dark:text-white">
                {modal === "nuevo" ? "Nuevo usuario" : "Editar usuario"}
              </h2>
              <button onClick={() => setModal("cerrado")} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3">
              {msg && (
                <div className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                  {msg.texto}
                </div>
              )}

              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Nombre completo *
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inp} />
                {err("nombre") && <span className={errMsg}>{err("nombre")}</span>}
              </label>

              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Correo *
                <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} className={inp} />
                {err("correo") && <span className={errMsg}>{err("correo")}</span>}
              </label>

              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Cédula (opcional)
                <input value={form.ci} onChange={(e) => setForm({ ...form, ci: e.target.value })} className={inp} placeholder="Para que pueda entrar con su CI" />
                {err("ci") && <span className={errMsg}>{err("ci")}</span>}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Rol
                  <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} className={inp}>
                    <option value="admin">Administrador</option>
                    <option value="usuario">Usuario</option>
                    <option value="KARDEX">Kardex · Revisión de solicitudes</option>
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Estado
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className={inp}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="bloqueado">Bloqueado</option>
                  </select>
                </label>
              </div>

              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Contraseña {modal === "nuevo" ? "*" : "(dejar vacío para no cambiarla)"}
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inp} autoComplete="new-password" />
                {err("password") && <span className={errMsg}>{err("password")}</span>}
                {modal === "nuevo" && <span className="block mt-1 text-[10px] text-slate-400">Mínimo 8 caracteres.</span>}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModal("cerrado")} className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={enviar} disabled={guardando} className="px-5 py-2 rounded-xl text-xs font-black bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "password" && editando && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <h2 className="font-black text-base text-slate-900 dark:text-white">Cambiar contraseña</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">Usuario: <b>{editando.nombre}</b> ({editando.correo})</p>

            <div className="space-y-3">
              {msg && (
                <div className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                  {msg.texto}
                </div>
              )}
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Su contraseña actual (confirmación) *
                <input type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} className={inp} autoComplete="current-password" />
              </label>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Nueva contraseña *
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inp} autoComplete="new-password" />
                <span className="block mt-1 text-[10px] text-slate-400">Mínimo 8 caracteres.</span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModal("cerrado")} className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={cambiarPassword} disabled={guardando || !form.password} className="px-5 py-2 rounded-xl text-xs font-black bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-50">
                {guardando ? "Cambiando…" : "Cambiar contraseña"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "borrar" && editando && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="font-black text-base text-slate-900 dark:text-white">Eliminar usuario</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              ¿Eliminar a <b>{editando.nombre}</b> ({editando.correo})? Perderá el acceso al sistema.
            </p>
            {msg && <div className="mt-3 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{msg.texto}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal("cerrado")} className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={eliminar} disabled={guardando} className="px-4 py-2 rounded-xl text-xs font-black bg-red-700 hover:bg-red-800 text-white disabled:opacity-50">
                {guardando ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}