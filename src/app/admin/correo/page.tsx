"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
  Server,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Diagnóstico del correo SMTP (solo administrador).
 *
 * Permite comprobar desde el propio sistema si las credenciales SMTP funcionan y enviar
 * un correo de prueba, sin depender de la terminal (`pnpm correo:probar`) ni de scripts
 * externos. Es el equivalente dentro de la aplicación del script `test_smtp.py`.
 */

interface EstadoCorreo {
  configurado: boolean;
  host: string | null;
  puerto: number;
  remitente: string | null;
  respaldoActivo: boolean;
}

const inp =
  "mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600";

export default function AdminCorreoPage() {
  const { user, loading: authLoading } = useAuth();
  const [estado, setEstado] = useState<EstadoCorreo | null>(null);
  const [destino, setDestino] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (user?.rol !== "admin") return;
    fetch("/api/correo/probar")
      .then((res) => res.json())
      .then((j) => setEstado(j))
      .catch(() => setMsg({ tipo: "error", texto: "No se pudo leer el estado del SMTP." }));
  }, [user]);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setMsg(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/correo/probar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino: destino.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo enviar el correo de prueba.");
      setMsg({ tipo: "ok", texto: `Correo de prueba enviado a ${destino.trim()}. Revise la bandeja y el spam.` });
    } catch (e) {
      setMsg({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo enviar el correo." });
    } finally {
      setEnviando(false);
    }
  };

  if (authLoading) {
    return <div className="max-w-3xl mx-auto p-8 text-sm text-slate-500 dark:text-slate-400">Verificando sesión…</div>;
  }

  if (!user || user.rol !== "admin") {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm dark:border-amber-900 dark:bg-amber-950">
          <b>Acceso restringido:</b> esta página es exclusiva de administrador.
          <br />
          <Link href="/login" className="font-bold text-blue-800 underline dark:text-blue-400">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mail className="h-7 w-7 text-blue-900 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Correo del sistema</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Verifique el envío de enlaces de recuperación y verificación.
            </p>
          </div>
        </div>
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Server className="h-5 w-5 text-blue-800 dark:text-blue-400" />
          Configuración actual
        </h2>
        {estado ? (
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</dt>
              <dd className={estado.configurado ? "font-bold text-emerald-700 dark:text-emerald-400" : "font-bold text-red-700 dark:text-red-400"}>
                {estado.configurado ? "Configurado" : "Sin configurar"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Servidor</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {estado.host ?? "—"}:{estado.puerto}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Remitente</dt>
              <dd className="break-all font-semibold text-slate-800 dark:text-slate-200">{estado.remitente ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Puertos de respaldo</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {estado.respaldoActivo ? "Activos (587 → 2525 → 465)" : "Desactivados"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Leyendo configuración…</p>
        )}
        {estado && !estado.configurado && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Faltan variables SMTP en el servidor. Complete <code>SMTP_HOST</code>, <code>SMTP_USER</code>,{" "}
            <code>SMTP_PASS</code> y <code>CORREO_REMITENTE</code> en el <code>.env</code> y reinicie el contenedor.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Send className="h-5 w-5 text-blue-800 dark:text-blue-400" />
          Enviar correo de prueba
        </h2>
        <form onSubmit={enviar} className="mt-4 space-y-4">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Correo de destino
            <input
              type="email"
              required
              maxLength={150}
              value={destino}
              onChange={(event) => setDestino(event.target.value)}
              placeholder="nombre@dominio.com"
              className={inp}
            />
          </label>
          <button
            disabled={enviando || !estado?.configurado}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f3a6b] py-3 font-extrabold tracking-wide text-white shadow-md ring-1 ring-inset ring-white/15 hover:bg-[#0b2b52] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {enviando ? "Enviando…" : "Enviar prueba"}
          </button>
          {msg && (
            <p
              role="alert"
              className={
                msg.tipo === "ok"
                  ? "flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300"
              }
            >
              {msg.tipo === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              {msg.texto}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
