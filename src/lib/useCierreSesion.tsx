"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LogOut, Loader2 } from "lucide-react";

type DestinoCierre = "titulados" | "home" | "back";

const SCROLL_KEY = "sg_scroll_titulados";

// Rutas que pertenecen al sistema de seguimiento (navegar atrás internamente NO cierra sesión).
function esPaginaInterna(p: string) {
  return (
    p === "/titulados" ||
    p === "/login" ||
    p === "/admin" ||
    p.startsWith("/admin/") ||
    p.startsWith("/kardex/") ||
    p.startsWith("/kpis/") ||
    p.startsWith("/noticias/") ||
    p.startsWith("/portal/")
  );
}

function limpiarScrollGuardado() {
  try {
    sessionStorage.removeItem(SCROLL_KEY);
  } catch {}
}

// Guardia global para el botón "atrás" del navegador: solo una instancia escucha popstate.
let guardiaInstalada = false;
const manejadores: Array<() => void> = [];

function onPopGlobal() {
  const h = manejadores[manejadores.length - 1];
  if (h) h();
}

function registrarManejador(h: () => void): () => void {
  manejadores.push(h);
  if (!guardiaInstalada) {
    guardiaInstalada = true;
    window.addEventListener("popstate", onPopGlobal);
  }
  return () => {
    const i = manejadores.indexOf(h);
    if (i >= 0) manejadores.splice(i, 1);
    if (manejadores.length === 0 && guardiaInstalada) {
      window.removeEventListener("popstate", onPopGlobal);
      guardiaInstalada = false;
    }
  };
}

/**
 * Flujo de cierre de sesión reutilizable.
 * Overlay unificado: la pregunta de confirmación usa el MISMO fondo de la animación
 * de carga; al aceptar, cambia a la animación "CERRANDO SESIÓN" sobre ese mismo fondo.
 * También intercepta el botón "atrás" nativo del navegador cuando la sesión está activa
 * y el retroceso sacaría del sistema de seguimiento.
 */
export function useCierreSesion() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [confirm, setConfirm] = useState<DestinoCierre | null>(null);
  const [cerrando, setCerrando] = useState(false);
  // El overlay se monta en un portal sobre document.body. Antes se renderizaba
  // dentro de <nav>, y como el navbar es fixed con z-50 y sus hijos crean
  // contextos de apilamiento, el aviso "de fondo" y el "CERRANDO SESIÓN" se
  // veían superpuestos o recortados. Con el portal solo hay una capa, la última.
  const [montado, setMontado] = useState(false);

  const pathRef = useRef(pathname);
  const urlRef = useRef("");
  const origenRef = useRef("");
  const confirmRef = useRef(confirm);
  const cerrandoRef = useRef(cerrando);
  const userRef = useRef(user);
  // Marca el tramo entre que se acepta el cierre y que se aterriza en /login. Durante ese
  // tramo el overlay debe seguir montado aunque la sesión ya esté cerrada.
  const navegandoRef = useRef(false);
  pathRef.current = pathname;
  confirmRef.current = confirm;
  cerrandoRef.current = cerrando;
  userRef.current = user;

  // El portal solo puede crearse en el cliente.
  useEffect(() => {
    setMontado(true);
    return () => setMontado(false);
  }, []);

  // Mantener la URL actual para poder restaurarla al interceptar "atrás".
  useEffect(() => {
    urlRef.current = window.location.href;
  }, [pathname]);

  // Bloquear el scroll del fondo mientras el overlay está visible.
  useEffect(() => {
    const activo = confirm !== null || cerrando;
    document.body.style.overflow = activo ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [confirm, cerrando]);

  // Intercepta el botón "atrás" del navegador: si la sesión está activa y el
  // retroceso sacaría del sistema de seguimiento, muestra el anuncio de confirmación.
  useEffect(() => {
    const onAtras = () => {
      if (!userRef.current || cerrandoRef.current) return;
      const actual = pathRef.current;
      const destino = window.location.pathname;
      // Solo interesa al salir desde una página del sistema hacia fuera.
      if (!esPaginaInterna(actual)) return;
      // Navegación interna (p. ej. noticia → titulados): se permite y restaura scroll.
      if (esPaginaInterna(destino)) return;
      // Se cancela el retroceso y se pide confirmación de cierre de sesión.
      const origen = urlRef.current || window.location.origin + actual;
      origenRef.current = origen;
      if (!confirmRef.current) setConfirm("home");
      // Restaurar la URL actual (cancela la navegación que intentó el navegador).
      try {
        window.history.pushState(window.history.state, "", origen);
      } catch {}
      // Si Next.js ya procesó el retroceso, forzar el router de vuelta a la página original.
      setTimeout(() => {
        if (window.location.pathname !== actual) {
          try {
            router.replace(actual, { scroll: false });
          } catch {}
        }
      }, 0);
    };
    return registrarManejador(onAtras);
  }, [router]);

  // Si la sesión ya terminó (logout), limpiar confirmación y animación para que el
  // overlay nunca quede fijo cubriendo la aplicación.
  useEffect(() => {
    if (user) return;
    setConfirm(null);
    // Salvedad: durante el cierre en curso el overlay tiene que aguantar hasta que la
    // navegación a /login termine. Si se retira aquí, el dashboard se queda a la vista ya
    // sin sesión y muestra "Acceso restringido: el dashboard completo es exclusivo de
    // administrador" en el tiempo que tarda la navegación.
    if (!navegandoRef.current) setCerrando(false);
  }, [user]);

  // El Navbar vive en el layout raíz (src/app/layout.tsx), así que NO se desmonta al
  // navegar: el overlay hay que retirarlo explícitamente al aterrizar en /login. Sin esto,
  // el aviso "CERRANDO SESIÓN" queda congelado encima del formulario de inicio de sesión.
  useEffect(() => {
    if (pathname !== "/login") return;
    navegandoRef.current = false;
    setConfirm(null);
    setCerrando(false);
  }, [pathname]);

  /**
   * La sesión es interna: con la sesión abierta NO se puede saltar a una página de fuera
   * del sistema (la portada "/", "/kpis/*", "/noticias/*", "/titulados"… son internas;
   * lo que queda fuera es la portada institucional "/"). Cualquier intento de navegación
   * hacia el exterior se cancela y se muestra el aviso de cierre de sesión.
   *
   * Solo intercepta clics de ENLACES (<a>): los <Link> de Next renderizan <a>. Los
   * botones que llaman a router.push() pasan por su propio manejador.
   */
  useEffect(() => {
    if (!user) return;

    const alPulsar = (e: MouseEvent) => {
      if (cerrandoRef.current || confirmRef.current) return;

      const objetivo = e.target as HTMLElement;
      const enlace = objetivo.closest("a");
      if (!enlace) return;

      const href = enlace.getAttribute("href") || "";
      // Enlaces externos, descargas, anclas o javascript: no se tocan.
      if (!href.startsWith("/")) return;
      if (enlace.hasAttribute("download") || href.startsWith("/api/")) return;
      // Destino ya abierto en otra pestaña.
      if (enlace.target === "_blank") return;
      // Navegación dentro del propio sistema: se permite.
      if (esPaginaInterna(href.split("?")[0]!)) return;

      e.preventDefault();
      e.stopPropagation();
      origenRef.current = window.location.href;
      setConfirm("home");
    };

    document.addEventListener("click", alPulsar, true);
    return () => document.removeEventListener("click", alPulsar, true);
  }, [user]);

  const cancelar = () => {
    setConfirm(null);
    // Si venimos de una intercepción de "atrás", se restaura la página de origen.
    if (origenRef.current && origenRef.current !== window.location.href) {
      try {
        router.replace(origenRef.current, { scroll: false });
      } catch {}
    }
    origenRef.current = "";
  };

  const rolLabel = user
    ? user.rol === "admin"
      ? "Administrador"
      : user.rol === "TITULADO"
        ? "Titulado"
        : user.rol === "EGRESADO"
          ? "Egresado"
          : "Kardex"
    : "Sistema";

  const volverSeguimiento = () => {
    // El botón home siempre inicia desde arriba (no restaura posición de scroll).
    limpiarScrollGuardado();
    // Con sesión abierta solo se pide la confirmación: el overlay decide si se sale o no.
    // Antes, desde /login además se navegaba de golpe, saltándose esa confirmación.
    if (user) setConfirm("titulados");
    else router.push("/titulados");
  };

  const pedir = (d: DestinoCierre) => setConfirm(d);

  /**
   * Al aceptar, la sesión se cierra y se aterriza en "/login" con el formulario de CI y
   * contraseña, que es lo mismo que ve un titulado o un egresado al cerrar su sesión.
   *
   * La navegación se hace con `replace` y no con `push`: la página cerrada no debe quedar
   * en el historial, o el botón "atrás" devolvería a un dashboard que ya no tiene sesión.
   * Tampoco se toca window.history a mano: replaceState sobre la ruta de destino después
   * de un router.push hace que Next descarte la navegación pendiente, dejando la URL en
   * /login con el dashboard todavía montado en pantalla.
   */
  const aceptar = () => {
    origenRef.current = "";
    limpiarScrollGuardado();
    navegandoRef.current = true;
    // El overlay cambia de la pregunta al aviso "CERRANDO SESIÓN" porque `cerrando` pasa a
    // true; la pregunta se retira con `confirm` en null (ver contenidoOverlay).
    setConfirm(null);
    setCerrando(true);
    setTimeout(async () => {
      await logout();
      router.replace("/login");
    }, 1300);
  };

  const contenidoOverlay = (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-5 text-white"
      style={{ backgroundColor: "var(--nav-bg)" }}
    >
      <div className="relative">
        <div className="absolute -inset-4 rounded-full blur-md bg-white/10 animate-pulse" />
        <div
          className={`w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center relative ${
            cerrando ? "animate-bounce" : ""
          }`}
        >
          {confirm ? <LogOut className="w-7 h-7 text-red-300" /> : <LogOut className="w-7 h-7" />}
        </div>
      </div>

      {confirm ? (
        <>
          <div className="text-center max-w-md w-full px-4">
            <h2 className="text-xl font-black tracking-tight">¿Está seguro de cerrar la sesión?</h2>
            <p className="mt-2 text-sm text-white/70">
              Su sesión de <b className="text-white">{rolLabel}</b> se cerrará y volverá a la
              página de inicio de sesión.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm px-4">
            <button
              onClick={cancelar}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wide text-white bg-white/10 border border-white/20 hover:bg-white/20 transition"
            >
              Cancelar
            </button>
            <button
              onClick={aceptar}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wide text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/30 transition"
            >
              Aceptar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-sm font-black tracking-[0.25em] uppercase animate-pulse">
              CERRANDO SESIÓN
            </p>
          </div>
          <p className="text-xs text-white/60 font-semibold tracking-widest uppercase">{rolLabel}</p>
        </>
      )}
    </div>
  );

  // Una sola capa, montada directamente en <body>. El `montado` evita que el
  // servidor intente crear el portal (document no existe en SSR).
  const overlay =
    montado && (confirm !== null || cerrando)
      ? createPortal(contenidoOverlay, document.body)
      : null;

  return { sesionActiva: !!user, rolLabel, volverSeguimiento, pedir, overlay };
}