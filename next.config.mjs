/** @type {import('next').NextConfig} */

// Cabeceras de seguridad aplicadas a TODAS las respuestas (OWASP Secure Headers).
//
// Se declaran aquí y no en el middleware porque el middleware no se ejecuta en las
// peticiones que Next sirve estáticamente, y estas cabeceras deben acompañar también a
// la portada y a los assets.
//
// La CSP es deliberadamente MÍNIMA en producción: no se usa 'unsafe-eval' porque
// App Router no lo necesita. `unsafe-inline` queda solo para estilos, que es lo que
// exigen los componentes actuales; los scripts siguen sujetos a la lista de fuentes,
// de modo que un XSS inyectado no puede cargar código externo.
//
// EN DESARROLLO sí hace falta `unsafe-eval`: el runtime de webpack de Next lo usa para
// los source maps y el HMR. Sin él, el bundle del cliente se evalúa y el navegador lo
// bloquea, la página queda sin hidratación y TODO lo que dependa de `useEffect` se
// queda colgado ("Cargando indicadores...", el captcha nunca se monta, etc.).
// `eval` es una superficie de ataque real, por eso solo se permite fuera de producción.
const esDesarrollo = process.env.NODE_ENV !== "production";

// `connect-src https://challenges.cloudflare.com` lo necesita el widget de Turnstile:
// sin esa entrada el script carga pero su beacon/XHR de verificación se bloquea, el
// token nunca llega y el login espera indefinidamente.
const cabecerasSeguridad = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
      // Los estilos generados en línea por Tailwind y los estilos de Next requieren
      // 'unsafe-inline'; no se relaja ningún otro tipo de recurso.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com data: blob:",
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: cabecerasSeguridad,
      },
    ];
  },
};

export default nextConfig;