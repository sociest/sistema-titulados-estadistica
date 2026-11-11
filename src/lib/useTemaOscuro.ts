"use client";
import { useEffect, useState } from "react";

/**
 * Indica si el tema activo es el oscuro.
 *
 * El proyecto usa `darkMode: "class"` (ver tailwind.config.ts) y el script inline de
 * src/app/layout.tsx aplica la clase `dark` sobre <html> antes del primer pintado, leyendo
 * localStorage["theme"] y la paleta elegida. No hay ThemeProvider ni next-themes, y Recharts
 * dibuja SVG donde las clases `dark:` de Tailwind no aplican, así que los gráficos tienen que
 * resolver el tema en el cliente.
 *
 * Se observa la clase de <html> con un MutationObserver porque el toggle de Navbar.tsx la
 * cambia en caliente, sin recargar ni remontar el árbol de componentes.
 */
export function useTemaOscuro(): boolean {
  const [oscuro, setOscuro] = useState<boolean>(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const raiz = document.documentElement;
    const leer = () => setOscuro(raiz.classList.contains("dark"));
    leer();
    const observador = new MutationObserver(leer);
    observador.observe(raiz, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
  }, []);

  return oscuro;
}