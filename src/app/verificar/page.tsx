"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, CheckCircle2, AlertTriangle, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * /verificar?token=...
 *
 * Última pantalla del alta pública (decisión D5, opción B). Al abrir el enlace del correo
 * se llama a `GET /api/verificar`, que consume el token de un solo uso.
 *
 * Importante: verificar el correo NO habilita el acceso. El registro sigue PENDIENTE
 * hasta que un administrador lo valida, y el texto de la pantalla lo dice, para que nadie
 * creer que una cuenta queda habilitada al instante.
 */

type Estado = "cargando" | "ok" | "error";

function VerificarPanel() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [mensaje, setMensaje] = useState("");
  const params = useSearchParams();
  const router = useRouter();
  const { refrescar } = useAuth();
  // En modo estricto de React el efecto puede dispararse dos veces en desarrollo, y el
  // token es de un solo uso: sin esta guarda, la segunda pasada lo gastaría y mostraría
  // un falso error.
  const consumido = useRef(false);

  useEffect(() => {
    document.title = "Verificación de correo | Seguimiento a Titulados";
  }, []);

  useEffect(() => {
    if (consumido.current) return;
    consumido.current = true;

    const token = params.get("token");
    if (!token) {
      setEstado("error");
      setMensaje("El enlace no es válido: falta el código de verificación.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/verificar?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          setEstado("ok");
          setMensaje(data.mensaje ?? "Su correo quedó verificado.");
          await refrescar();
        } else {
          setEstado("error");
          setMensaje(data.error ?? "No se pudo verificar el enlace.");
        }
      } catch {
        setEstado("error");
        setMensaje("Error de red. Intente nuevamente.");
      }
    })();
  }, [params, refrescar]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16 text-[var(--fg)]">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-11 h-11 rounded-xl bg-[var(--nav-bg)] text-white flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-amber-300" />
          </span>
          <div>
            <h1 className="text-lg font-black tracking-tight">Seguimiento a Titulados y Egresados</h1>
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
              Universidad Mayor de San Andrés
            </p>
          </div>
        </div>

        {estado === "cargando" && (
          <div className="flex items-center gap-3 py-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-sm">Verificando su correo…</p>
          </div>
        )}

        {estado === "ok" && (
          <>
            <div className="flex items-center gap-2 text-emerald-600 mb-3">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="font-bold">Correo verificado</h2>
            </div>
            <p className="text-sm leading-relaxed mb-4">{mensaje}</p>
            <p className="text-xs text-[var(--muted)] leading-relaxed mb-6">
              Puede cerrar esta ventana. Para recibir avisos cuando su registro sea
              validado, vuelva a entrar con su número de cédula.
            </p>
          </>
        )}

        {estado === "error" && (
          <>
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-bold">No se pudo verificar</h2>
            </div>
            <p className="text-sm leading-relaxed mb-6">{mensaje}</p>
          </>
        )}

        <a
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[var(--nav-bg)] text-white hover:opacity-90 transition"
        >
          <LogIn className="w-4 h-4" />
          Ir al inicio de sesión
        </a>
      </div>
    </main>
  );
}

export default function PaginaVerificar() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </main>
      }
    >
      <VerificarPanel />
    </Suspense>
  );
}