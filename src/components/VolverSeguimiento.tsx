"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function VolverSeguimiento({ className }: { className?: string }) {
  return (
    <Link href="/titulados" className={className}>
      <ArrowLeft className="w-4 h-4 shrink-0" /> Volver a Seguimiento a Titulados
    </Link>
  );
}
