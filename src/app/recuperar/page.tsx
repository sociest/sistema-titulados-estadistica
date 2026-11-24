"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, Mail, Eye, EyeOff } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";

function RecuperarFormulario() {
  const params = useSearchParams();
  const tokenParam = params.get("token");

  const [ci, setCi] = useState("");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState(tokenParam ? "" : "");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [paso, setPaso] = useState<"solicitud" | "verificacion">(
    tokenParam ? "verificacion" : "solicitud"
  );
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [actualizado, setActualizado] = useState(false);

  useEffect(() => {
    document.title = "Recuperar acceso | Sistema SEGUIT";
  }, []);

  const solicitarCodigo = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMensaje("");
    setCargando(true);

    try {
      const respuesta = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci: ci.trim(), correo: correo.trim(), turnstileToken }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo procesar la solicitud.");

      setMensaje(datos.mensaje);
      setPaso("verificacion");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar la solicitud.");
    } finally {
      setCargando(false);
    }
  };

  const restablecerPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password) || !/[0-9]/.test(password)) {
      setError("La contraseña debe incluir al menos una letra y un número.");
      return;
    }

    setCargando(true);
    try {
      const payload: { password: string; codigo?: string; token?: string } = {
        password,
      };

      if (tokenParam) {
        payload.token = tokenParam;
      } else {
        payload.codigo = codigo.trim();
      }

      const respuesta = await fetch("/api/auth/restablecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo actualizar la contraseña.");

      setActualizado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar la contraseña.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          {paso === "verificacion" || tokenParam ? (
            <KeyRound className="h-7 w-7 text-[#0f3a6b] dark:text-blue-400" />
          ) : (
            <Mail className="h-7 w-7 text-[#0f3a6b] dark:text-blue-400" />
          )}
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            {actualizado
              ? "Contraseña actualizada"
              : paso === "verificacion"
              ? "Restablecer contraseña"
              : "Recuperar acceso"}
          </h1>
        </div>

        {actualizado ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h2 className="font-bold">Actualización exitosa</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Su contraseña ha sido actualizada. Puede ingresar al sistema con sus nuevas credenciales.
            </p>
            <a
              href="/login"
              className="inline-block rounded-xl bg-[#0f3a6b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0b2b52] dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Iniciar sesión
            </a>
          </div>
        ) : paso === "verificacion" ? (
          <form onSubmit={restablecerPassword} autoComplete="off" data-form-type="other" className="space-y-4">
            {mensaje && (
              <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/60 dark:text-blue-200">
                {mensaje}
              </p>
            )}

            {!tokenParam && (
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Código de verificación (6 dígitos)
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoComplete="off"
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ""))}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-center text-lg font-mono tracking-widest text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Nueva contraseña
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  name="nueva_clave_acceso"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  minLength={8}
                  maxLength={200}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={!mostrarPassword ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
                  className={`w-full rounded-xl border border-slate-300 bg-white pl-3 pr-10 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100${!mostrarPassword ? " input-secret-masked" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Confirmar contraseña
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  name="confirmar_clave_acceso"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  minLength={8}
                  maxLength={200}
                  required
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  style={!mostrarConfirmacion ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
                  className={`w-full rounded-xl border border-slate-300 bg-white pl-3 pr-10 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100${!mostrarConfirmacion ? " input-secret-masked" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarConfirmacion((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={mostrarConfirmacion ? "Ocultar confirmación" : "Ver confirmación"}
                >
                  {mostrarConfirmacion ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              disabled={cargando}
              className="w-full rounded-xl bg-[#0f3a6b] py-3 text-sm font-extrabold text-white shadow-md hover:bg-[#0b2b52] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {cargando ? "Guardando..." : "Guardar contraseña"}
            </button>

            {!tokenParam && (
              <button
                type="button"
                onClick={() => {
                  setPaso("solicitud");
                  setError("");
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Solicitar un nuevo código
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={solicitarCodigo} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ingrese su número de cédula de identidad y correo electrónico registrado para recibir el código de acceso.
            </p>

            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Cédula de identidad
              <input
                inputMode="numeric"
                autoComplete="username"
                required
                value={ci}
                onChange={(e) => setCi(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                maxLength={150}
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <div className="flex justify-center">
              <TurnstileWidget
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              disabled={cargando}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f3a6b] py-3 text-sm font-extrabold text-white shadow-md hover:bg-[#0b2b52] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {cargando ? "Enviando..." : "Enviar código"}
            </button>
          </form>
        )}

        {!actualizado && (
          <p className="mt-6 border-t border-slate-200 pt-4 text-center text-sm dark:border-slate-800">
            <a href="/login" className="font-semibold text-[#0f3a6b] hover:underline dark:text-blue-300">
              Volver al inicio de sesión
            </a>
          </p>
        )}
      </section>
    </div>
  );
}

export default function RecuperarPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Cargando...</div>}>
      <RecuperarFormulario />
    </Suspense>
  );
}
