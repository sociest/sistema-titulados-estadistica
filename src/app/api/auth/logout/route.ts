/**
 * Alias de compatibilidad: `POST /api/auth/logout` reutiliza el handler de
 * `/api/auth/sesion`, que es la ruta canónica del cierre de sesión.
 */
export { POST } from "../sesion/route";
