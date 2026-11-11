"use client";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  visible: boolean;
  icon: ReactNode;
  title: string;
  label: string;
}

export default function LoadingOverlay({ visible, icon, title, label }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 text-white"
      style={{ backgroundColor: "var(--nav-bg)" }}
    >
      <div className="relative">
        <div className="absolute -inset-4 rounded-full blur-md bg-white/10 animate-pulse" />
        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center relative animate-bounce">
          {icon}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <p className="text-sm font-black tracking-[0.25em] uppercase animate-pulse">{title}</p>
      </div>
      <p className="text-xs text-white/60 font-semibold tracking-widest uppercase">{label}</p>
    </div>
  );
}