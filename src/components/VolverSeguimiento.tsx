"use client";
import { ArrowLeft } from "lucide-react";
import { useCierreSesion } from "@/lib/useCierreSesion";

export default function VolverSeguimiento({ className }: { className?: string }) {
  const { volverSeguimiento, overlay } = useCierreSesion();
  return (
    <>
      <button onClick={volverSeguimiento} className={className}>
        <ArrowLeft className="w-4 h-4 rotate-180" /> Volver a Seguimiento a Titulados
      </button>
      {overlay}
    </>
  );
}