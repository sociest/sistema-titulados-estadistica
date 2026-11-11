"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * Estado de sesión en el cliente.
 *
 * CAMBIO IMPORTANTE: la sesión ya NO vive en `localStorage`.
 *
 * Antes: `localStorage.setItem("auth_user", JSON.stringify(u))`. Eso significaba que
 * cualquiera podía abrir la consola (F12) y ejecutar
 *     localStorage.setItem("auth_user", '{"rol":"admin","ci":"x","nombre":"Yo"}')
 * para convertirse en administrador sin contraseña.
 *
 * Ahora: la sesión vive en una cookie httpOnly firmada por el servidor, y este contexto
 * solo PIDE al servidor quién es (`GET /api/auth/sesion`). Si el usuario no tiene cookie
 * válida, `user` queda en null y no hay nada que Falsear.
 */

export type Rol = "admin" | "TITULADO" | "EGRESADO" | "KARDEX";

export interface AuthUser {
  rol: Rol;
  ci: string;
  nombre: string;
  correo?: string | null;
  id?: number | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** Refresca la sesión desde el servidor (tras login o logout). */
  refrescar: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refrescar: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sesion", { cache: "no-store" });
      const data = await res.json();

      // El endpoint devuelve `autenticado` + los datos planos (decisión D1), no un objeto
      // `user`. Antes se leía `data.user`, que venía `undefined` en toda respuesta y dejaba
      // al usuario con la sesión aparenta cerrada en toda la aplicación.
      if (res.ok && data?.autenticado) {
        setUser({
          rol: data.rol,
          ci: data.ci,
          nombre: data.nombre ?? "",
          correo: data.correo ?? null,
          id: data.id ?? null,
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // `POST /api/auth/sesion` es el cierre de sesión: revoca la fila en `sesiones`,
      // borra la cookie y deja el evento anotado en `audit_log`. Antes se llamaba a
      // `DELETE /api/auth/logout`, una ruta que NO existía, así que la cookie sobrevivia
      // al cierre y la persona quedaba conectada.
      await fetch("/api/auth/sesion", { method: "POST", cache: "no-store" });
    } catch {
      // Aunque el servidor falle, el estado local se limpia: la UI no debe seguir
      // mostrando un menú de administrador a alguien que pidió salir.
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  return (
    <AuthContext.Provider value={{ user, loading, refrescar, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);