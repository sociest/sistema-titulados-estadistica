"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Megaphone, Newspaper } from "lucide-react";
import { CardPublicacion, type NoticiaPublica } from "@/components/Publicaciones";

export default function NoticiasPage() {
  const [publicaciones, setPublicaciones] = useState<NoticiaPublica[] | null>(null);

  useEffect(() => {
    fetch("/api/noticias")
      .then((response) => response.json())
      .then((data) => setPublicaciones(Array.isArray(data) ? data : []))
      .catch(() => setPublicaciones([]));
  }, []);

  const noticias = publicaciones?.filter((item) => item.categoria === "noticia") ?? [];
  const convocatorias = publicaciones?.filter((item) => item.categoria === "convocatoria") ?? [];

  return (
    <div className="min-h-screen dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link href="/titulados#noticias" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Volver al seguimiento
        </Link>
        <h1 className="mt-6 text-2xl font-black uppercase text-[#0f2d52] dark:text-white">Noticias y convocatorias</h1>

        {publicaciones === null ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Cargando publicaciones...</p>
        ) : publicaciones.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Aún no hay publicaciones.</p>
        ) : (
          <div className="mt-8 space-y-10">
            {[
              { titulo: "Noticias", icono: Newspaper, items: noticias },
              { titulo: "Convocatorias", icono: Megaphone, items: convocatorias },
            ].map(({ titulo, icono: Icono, items }) => (
              <section key={titulo}>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-black uppercase tracking-wider text-[#0f2d52] dark:text-white">
                  <Icono className="h-5 w-5" /> {titulo}
                </h2>
                {items.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => <CardPublicacion key={item.id} n={item} />)}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Aún no hay {titulo.toLowerCase()} publicadas.</p>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}