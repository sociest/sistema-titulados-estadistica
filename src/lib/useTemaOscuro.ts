"use client";
import { useEffect, useState } from "react";

/**
 * Indica si el tema activo es el oscuro.
 *
 * Arranca en `false` para coincidir siempre con el HTML SSR y actualiza tras montar,
 * evitando desajustes de hidratación en React.
 */
export function useTemaOscuro(): boolean {
  const [oscuro, setOscuro] = useState<boolean>(false);

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
