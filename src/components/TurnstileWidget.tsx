"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (errorCode?: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          retry?: "auto" | "never";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

interface TurnstileWidgetProps {
  siteKey?: string;
  onSuccess: (token: string) => void;
  onError?: (err?: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
}

export default function TurnstileWidget({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  theme = "auto",
  className = "",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Evitar ciclo infinito de re-renderizados: almacenar callbacks en refs
  // para que el widget no se desmonte ni se vuelva a renderizar cuando
  // el componente padre actualiza su estado (ej: setTurnstileToken).
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onExpireRef.current = onExpire;

  // Si no se especifica siteKey, se utiliza la variable pública de entorno
  // o el dummy sitekey oficial de Cloudflare para testing ("Always passes").
  const resolvedSiteKey =
    siteKey ||
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    "1x00000000000000000000AA";

  useEffect(() => {
    let scriptEl: HTMLScriptElement | null = null;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: resolvedSiteKey,
          theme,
          callback: (token: string) => {
            onSuccessRef.current?.(token);
          },
          "error-callback": (err) => {
            onErrorRef.current?.(err);
          },
          "expired-callback": () => {
            onExpireRef.current?.();
          },
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.error("[TURNSTILE] Error al renderizar:", err);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const scriptId = "cf-turnstile-script";
      let existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      if (!existingScript) {
        scriptEl = document.createElement("script");
        scriptEl.id = scriptId;
        scriptEl.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        scriptEl.async = true;
        scriptEl.defer = true;
        scriptEl.onload = () => {
          renderWidget();
        };
        document.head.appendChild(scriptEl);
      } else {
        existingScript.addEventListener("load", renderWidget);
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [resolvedSiteKey, theme]);

  return (
    <div
      ref={containerRef}
      className={`min-h-[65px] flex items-center justify-center my-3 ${className}`}
    />
  );
}
