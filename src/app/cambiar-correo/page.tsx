"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function CambiarCorreoPage() {
  const [ci, setCi] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [cambiosRestantes, setCambiosRestantes] = useState(0);
  const [correo, setCorreo] = useState("");
  const [passwordActual, setPasswordActual] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [saltando, setSaltando] = useState(false);
  const { refrescar } = useAuth();
  const router = useRouter();

  useEffect(() => {
    document.title = "Cambiar credencial de acceso | Seguimiento a Titulados";
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ciParam = params.get("ci") || "";
    const nombreParam = params.get("nombre") || "";
    const tipoParam = params.get("tipo") || "";
    const cambiosParam = params.get("cambios") || "";
    if (ciParam) setCi(ciParam);
    if (nombreParam) setNombre(nombreParam);
    if (tipoParam) setTipo(tipoParam);
    const cambiosParsed = cambiosParam ? parseInt(cambiosParam, 10) : 5;
    setCambiosRestantes(Number.isFinite(cambiosParsed) ? cambiosParsed : 5);
  }, []);

  const cambiosUsados = 5 - cambiosRestantes;

  const destinoPara = (rol: string): string => {
    if (rol === "admin") return "/admin/dashboard";
    if (rol === "KARDEX") return "/kardex/solicitudes";
    if (rol === "TITULADO") return "/portal/titulado";
    if (rol === "EGRESADO") return "/portal/egresado";
    return "/titulados";
  };

  const handleCambiar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);

    if (password !== confirmPassword) {
      setErr("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/correo/cambiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci, passwordActual, correo, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el correo");

      setMsg("Correo configurado correctamente.");
      await refrescar();
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaltar = async () => {
    if (cambiosRestantes <= 0) return;
    setSaltando(true);
    try {
      const res = await fetch("/api/correo/cambiar/saltar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar el salto");
      setCambiosRestantes((c) => {
        const nuevo = c - 1;
        setMsg(`Salto registrado. Le quedan ${nuevo} cambio(s).`);
        return nuevo;
      });
      setTimeout(() => {
        setSaltando(false);
      }, 1500);
    } catch (e: any) {
      setSaltando(false);
      setErr(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-7 h-7 text-blue-800 dark:text-blue-400" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Cambiar credencial de acceso
          </h1>
        </div>

        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Cambio obligatorio a correo electrónico
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Para mayor seguridad, su acceso cambiará de CI a correo
                electrónico. Puede saltar este paso{" "}
                <span className="font-bold">{cambiosRestantes}</span> vez(es)
                más. En el próximo ingreso será obligatorio.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Contador: <span className="font-bold">{cambiosUsados}/5</span>
                cambios usados.
              </p>
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-4 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        {msg && (
          <div className="mb-4 text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2">
            {msg}
          </div>
        )}

        <form onSubmit={handleCambiar} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Cédula de Identidad
            </label>
            <input
              value={ci}
              readOnly
              placeholder="Su CI"
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Correo electrónico
            </label>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@ejemplo.com"
              autoComplete="email"
              required
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Contraseña actual
            </label>
            <input
              type="password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              placeholder="Su contraseña actual"
              autoComplete="current-password"
              required
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita la contraseña"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {password !== confirmPassword && password !== "" && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Las contraseñas no coinciden.
            </p>
          )}

          <button
            type="submit"
            disabled={loading || password !== confirmPassword}
            className="w-full inline-flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl py-2.5 font-bold disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {loading ? "Configurando..." : "Cambiar a correo"}
          </button>
        </form>

        {cambiosRestantes > 0 && (
          <div className="mt-6">
            <button
              onClick={handleSaltar}
              disabled={saltando}
              className="w-full inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {saltando ? "Procesando..." : `Saltar (${cambiosRestantes} restante${cambiosRestantes !== 1 ? "s" : ""})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}