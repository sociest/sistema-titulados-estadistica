import { redirect } from "next/navigation";

/**
 * Página de raíz (/).
 *
 * Redirige en el servidor directamente a Seguimiento (/titulados), evitando
 * pantallazo en blanco e hidratación innecesaria en cliente.
 */
export default function HomePage() {
  redirect("/titulados");
}
