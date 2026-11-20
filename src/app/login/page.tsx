"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, GraduationCap, BookOpen, Users, LogIn, Info, Eye, EyeOff } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";
import TurnstileWidget from "@/components/TurnstileWidget";

function LoginForm() {
  const [ci, setCi] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [logueando, setLogueando] = useState<string | null>(null);
  const { user, loading: authLoading, refrescar } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const origenRaw = params.get("origen");
  const origen = origenRaw && /^\/(?!\/|\\)/.test(origenRaw) ? origenRaw : null;

  const destinoPara = (rol: string): string => {
    if (origen && origen !== "/login") return origen;
    if (rol === "admin") return "/admin/dashboard";
    if (rol === "KARDEX") return "/kardex/solicitudes";
    if (rol === "TITULADO") return "/portal/titulado";
    if (rol === "EGRESADO") return "/portal/egresado";
    return "/titulados";
  };

  useEffect(() => {
    document.title = "Iniciar sesión | Seguimiento a Titulados";
  }, []);

  // Si ya hay sesión válida, redirigir directamente a su panel.
  useEffect(() => {
    if (!authLoading && user && !logueando) {
      router.replace(destinoPara(user.rol));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, logueando, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci: ci.trim(), password, turnstileToken }),
      });
      const data = await res.json();

      // ── Cambio obligatorio de CI a correo ─────────────────────────────────────
      if (data.requiereCambioCorreo) {
        await refrescar();
        setLogueando(data.rol);
        try {
          sessionStorage.setItem(
            "sg_cambio_correo",
            JSON.stringify({
              ci: data.ci || ci.trim(),
              nombre: data.nombre || "",
              tipo: data.tipo || data.rol || "",
              cambios: data.cambiosCorreoRestantes ?? 5,
            })
          );
        } catch {}
        setTimeout(() => {
          router.push("/cambiar-correo");
        }, 900);
        return;
      }

      if (!res.ok) {
        if (data.codigo === "CORREO_OBLIGATORIO") {
          try {
            sessionStorage.setItem(
              "sg_cambio_correo",
              JSON.stringify({
                ci: data.ci || ci.trim(),
                nombre: data.nombre || "",
                tipo: data.tipo || "",
                cambios: 0,
              })
            );
          } catch {}
          setTimeout(() => {
            router.push("/cambiar-correo");
          }, 900);
          return;
        }
        throw new Error(data.error || "No se pudo iniciar sesión");
      }

      // La cookie httpOnly ya quedó emitida por el servidor; solo pedimos el perfil.
      await refrescar();
      setLogueando(data.rol);

      setTimeout(() => router.push(destinoPara(data.rol)), 900);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LoadingOverlay
        visible={!!logueando}
      icon={
        logueando === "admin" ? (
          <ShieldCheck className="w-7 h-7" />
        ) : logueando === "KARDEX" ? (
          <Users className="w-7 h-7" />
        ) : logueando === "TITULADO" ? (
          <GraduationCap className="w-7 h-7" />
        ) : (
          <BookOpen className="w-7 h-7" />
        )
      }
      title="Iniciando sesión"
      label={
        logueando === "admin"
          ? "Administrador"
          : logueando === "KARDEX"
            ? "Kardex"
            : logueando === "TITULADO"
              ? "Titulado"
              : "Egresado"
      }
      />

      <div className="max-w-lg mx-auto px-6 py-12">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="w-7 h-7 text-blue-800 dark:text-blue-400" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Iniciar sesión</h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Ingrese su credencial. El sistema detecta automáticamente su rol.
          </p>

          {origen && (
            <div className="mt-4 text-xs bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Debe iniciar sesión para acceder a esa página.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                CI / Correo / Usuario
              </label>
              <input
                value={ci}
                onChange={(e) => setCi(e.target.value)}
                placeholder="Su cédula de identidad o correo"
                autoComplete="username"
                className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Contraseña
              </label>
              <div className="relative mt-1">
                <input
                  type={mostrarPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-xl pl-3 pr-10 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Si es su primer ingreso o no recuerda su contraseña, puede configurarla por correo.
              </p>
            </div>

            {err && (
              <div className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            {/* Widget de protección anti-bots (Cloudflare Turnstile) */}
            <div className="flex justify-center">
              <TurnstileWidget
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
              />
            </div>

            <button
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#0f3a6b] hover:bg-[#0b2b52] dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl py-3 font-extrabold tracking-wide shadow-md shadow-blue-950/20 dark:shadow-blue-950/50 ring-1 ring-inset ring-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" /> {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm">
            <a
              href="/recuperar"
              className="font-semibold text-blue-800 hover:underline dark:text-blue-300"
            >
              ¿Primera vez u olvidó su contraseña?
            </a>
          </p>

          <p className="mt-6 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-200 dark:border-slate-800 pt-4">
            Si no puede acceder, comuníquese con la Secretaría de la Carrera de Estadística.
            Nunca comparta su cédula ni su contraseña.
          </p>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-6 py-12 text-sm text-slate-500 dark:text-slate-400">Cargando…</div>}>
      <LoginForm />
    </Suspense>
  );
}