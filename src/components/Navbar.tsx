"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, LogOut, LogIn, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCierreSesion } from "@/lib/useCierreSesion";

type Palette = "dis1" | "dis2" | "dis3" | "noche1" | "noche2" | "noche3";

export default function Navbar() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [palette, setPalette] = useState<Palette>("dis1");
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { volverSeguimiento, pedir, overlay } = useCierreSesion();
  const isEstadistica = pathname === "/";
  const isTitulados = pathname === "/titulados" || pathname.startsWith("/titulados") || pathname.startsWith("/kpis/");
  // Páginas donde se muestra el botón home secundario hacia el inicio del seguimiento
  const isSeguimientoSub = pathname === "/titulados" || pathname === "/login" || pathname === "/admin/dashboard" || pathname.startsWith("/portal/") || pathname.startsWith("/kpis/") || pathname.startsWith("/noticias/") || pathname.startsWith("/kardex/");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const savedPalette = localStorage.getItem("palette") as Palette | null;
    if (savedPalette) {
      setPalette(savedPalette);
      document.documentElement.setAttribute("data-palette", savedPalette);
      const isDark = savedPalette.startsWith("noche");
      setTheme(isDark ? "dark" : "light");
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    } else if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setTheme("dark");
      setPalette("noche1");
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-palette", "noche1");
    } else {
      setTheme("light");
      setPalette("dis1");
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-palette", "dis1");
    }
  }, []);

  // Cerrar el menú al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const applyPalette = (p: Palette) => {
    setPalette(p);
    localStorage.setItem("palette", p);
    document.documentElement.setAttribute("data-palette", p);
    const isDark = p.startsWith("noche");
    setTheme(isDark ? "dark" : "light");
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const toggleTheme = () => {
    if (theme === "light") {
      applyPalette("noche1");
    } else {
      applyPalette("dis1");
    }
  };

  const menuItems = [
    { label: "Inicio", href: "/", active: isEstadistica },
    { label: "Seguimiento", href: "/titulados", active: pathname === "/titulados" },
    { label: "Indicadores", href: "/kpis/titulados", active: pathname.startsWith("/kpis/") },
    { label: "Noticias", href: "/titulados#noticias", active: false },
    ...(user?.rol === "KARDEX" ? [{ label: "Solicitudes", href: "/kardex/solicitudes", active: pathname.startsWith("/kardex") }] : []),
  ];

  const leyendaSeguimiento = !user
    ? "Volver al inicio del sistema"
    : user.rol === "admin"
      ? "Cerrar sesión · Administrador"
      : user.rol === "TITULADO"
        ? "Cerrar sesión · Titulado"
        : user.rol === "EGRESADO"
          ? "Cerrar sesión · Egresado"
          : "Cerrar sesión · Kardex";

  const rolLabel = user
    ? user.rol === "admin"
      ? "Administrador"
      : user.rol === "TITULADO"
        ? "Titulado"
        : user.rol === "EGRESADO"
          ? "Egresado"
          : "Kardex"
    : "Sistema";

  return (
    <>
      {/* Espacio reservado para el navbar fijo (se mantiene visible al deslizar) */}
      <div className="h-[56px] w-full" aria-hidden="true" data-nav-espaciador />
      <nav data-navbar className="fixed top-0 inset-x-0 z-50 h-[56px] w-full border-b text-white" style={{ backgroundColor: "var(--nav-bg)", borderColor: "var(--nav-border)" }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[56px] gap-2">
          <Link href="/titulados" className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="w-10 h-10 flex items-center justify-center shadow-sm shrink-0 p-1 overflow-hidden">
              <img src="/2png/logo-seguimiento.png" alt="Símbolo de Seguimiento a Titulados" className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight hidden md:block">
              <p className="text-[12px] font-black tracking-tight leading-none">SEGUIMIENTO A TITULADOS</p>
              <p className="text-[13px] font-normal text-white/70 tracking-wide hidden xl:block">Carrera de Estadística · UMSA</p>
            </div>
          </Link>

          {/* Menú desplegado en laptop/pc; hamburguesa al reducir resolución */}
          <ul className="hidden lg:flex items-center gap-0.5 xl:gap-1 ml-1 xl:ml-2">
            {menuItems.map((item) =>
              item.href ? (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`px-2 xl:px-2.5 py-2 text-sm xl:text-[15px] font-normal tracking-wide rounded-lg transition whitespace-nowrap ${
                      item.active
                        ? "bg-white/15 text-white"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                    <span className="px-2 xl:px-2.5 py-2 text-sm xl:text-[15px] font-normal tracking-wide text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer whitespace-nowrap">
                    {item.label}
                  </span>
                </li>
              )
            )}
          </ul>

          <div className="flex items-center gap-1.5 shrink-0 justify-end min-w-0">
            <button onClick={toggleTheme} className="p-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 min-h-[40px] flex items-center" title={theme === "light" ? "Noche 1 (oscuro actual)" : "Dis 1 (claro actual)"}>
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-300" />}
            </button>

            {user ? (
              <button
                onClick={() => pedir("home")}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[15px] min-h-[44px] shadow-sm transition shrink-0"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            ) : !isEstadistica ? (
                <Link href="/login" className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white text-[#1e3a8a] font-bold text-[15px] hover:bg-white/90 shrink-0 min-h-[44px] shadow-sm">
                <LogIn className="w-4 h-4 shrink-0" />
                <span className="hidden 2xl:inline">Ingresar</span>
              </Link>
            ) : null}

            {/* Hamburguesa - todas las opciones (solo al reducir resolución) */}
            <button onClick={() => setMenuOpen((o) => !o)} className="flex lg:hidden p-2 rounded-lg border border-white/20 text-white/90 hover:bg-white/10 min-h-[40px] items-center gap-1.5 text-xs font-bold" aria-label="menú">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Dropdown hamburguesa */}
      {menuOpen && (
        <div className="border-t border-white/10 shadow-2xl" style={{ backgroundColor: "var(--nav-bg)" }}>
          <ul className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col">
            {menuItems.map((item) =>
              item.href ? (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`block px-3 py-3 rounded-xl text-[17px] font-normal transition ${item.active ? "bg-white text-[var(--nav-bg)]" : "text-white hover:bg-white/10"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                  <span className="block px-3 py-3 rounded-xl text-[17px] font-normal text-white/60 cursor-default opacity-70">
                    {item.label} ▾
                  </span>
                </li>
              )
            )}
            {/* Con sesión activa tampoco hay salida en el menú desplegable. */}
            {isSeguimientoSub && !user && (
              <li>
                <button onClick={volverSeguimiento} className="w-full text-left px-3 py-3 rounded-xl text-[17px] font-normal text-white hover:bg-white/10">
                  ← Inicio del seguimiento
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
      </nav>

      {overlay}
    </>
  );
}