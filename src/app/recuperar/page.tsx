"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";

function RecuperarFormulario() {
  const params = useSearchParams();
  const token = params.get("token");
  const [ci, setCi] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [actualizado, setActualizado] = useState(false);

  useEffect(() => {
    document.title = token
      ? "Configurar contraseña | Seguimiento a Titulados"
      : "Recuperar acceso | Seguimiento a Titulados";
  }, [token]);

  const solicitarEnlace = async (event: FormEvent) => {
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
      setSolicitudEnviada(true);
      setMensaje(datos.mensaje);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la solicitud.");
    } finally {
      setCargando(false);
    }
  };

  const guardarPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/restablecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo actualizar la contraseña.");
      setActualizado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la contraseña.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          {token ? (
            <KeyRound className="h-7 w-7 text-blue-800 dark:text-blue-400" />
          ) : (
            <Mail className="h-7 w-7 text-blue-800 dark:text-blue-400" />
          )}
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            {token ? "Configurar contraseña" : "Primer acceso o contraseña olvidada"}
          </h1>
        </div>

        {actualizado ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h2 className="font-bold">Contraseña actualizada</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ya puede iniciar sesión con su CI y su nueva contraseña.
            </p>
            <a href="/login" className="inline-block font-bold text-blue-800 hover:underline dark:text-blue-300">
              Volver al inicio de sesión
            </a>
          </div>
        ) : token ? (
          <form onSubmit={guardarPassword} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Elija una contraseña de al menos 8 caracteres.
            </p>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Repita la contraseña
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                value={confirmacion}
                onChange={(event) => setConfirmacion(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
            <button
              disabled={cargando}
              className="w-full rounded-xl bg-blue-900 py-2.5 font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {cargando ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        ) : solicitudEnviada ? (
          <div className="space-y-4">
            <p role="status" className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{mensaje}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Revise también la carpeta de correo no deseado.
            </p>
          </div>
        ) : (
          <form onSubmit={solicitarEnlace} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ingrese la CI y el correo que figuran en su registro. Le enviaremos un enlace
              de un solo uso para crear o cambiar su contraseña.
            </p>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Cédula de identidad
              <input
                inputMode="numeric"
                autoComplete="username"
                required
                value={ci}
                onChange={(event) => setCi(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Correo registrado
              <input
                type="email"
                autoComplete="email"
                maxLength={150}
                required
                value={correo}
                onChange={(event) => setCorreo(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <div className="flex justify-center">
              <TurnstileWidget
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
              />
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
            <button
              disabled={cargando}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 py-2.5 font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {cargando ? "Enviando..." : "Enviar enlace"}
            </button>
          </form>
        )}

        {!actualizado && (
          <p className="mt-6 border-t border-slate-200 pt-4 text-center text-sm dark:border-slate-800">
            <a href="/login" className="font-semibold text-blue-800 hover:underline dark:text-blue-300">
              Volver al inicio de sesión
            </a>
          </p>
        )}
      </section>
    </main>
  );
}

export default function RecuperarPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Cargando…</div>}>
      <RecuperarFormulario />
    </Suspense>
  );
}
