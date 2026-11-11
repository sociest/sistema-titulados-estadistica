"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Página de raíz (/).
 *
 * El sistema inicia directamente en Seguimiento (/titulados), por lo que la raíz
 * redirige allí en lugar de mostrar la portada de estadística.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/titulados");
  }, [router]);

  return null;
}
