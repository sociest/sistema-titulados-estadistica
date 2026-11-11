import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sistema de Seguimiento a Titulados | Carrera de Estadística - UMSA",
  description: "Sistema oficial de acreditación y seguimiento a graduados titulados de la Carrera de Estadística, Universidad Mayor de San Andrés.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(_){}` }} />
      </head>
      <body className="min-h-screen bg-[#e3ebf4] text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200 antialiased">
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
