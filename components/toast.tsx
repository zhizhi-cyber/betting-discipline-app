"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onDone: () => void;
  duration?: number;
}

export function Toast({ message, type = "success", onDone, duration = 2000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);

  const colors =
    type === "success" ? "bg-profit/90 text-white"
    : type === "error" ? "bg-loss/90 text-white"
    : "bg-foreground/90 text-background";

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg transition-all duration-300 max-w-[320px] text-center ${colors} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      {message}
    </div>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type?: "success" | "error" | "info" } | null>(null);

  const show = (message: string, type?: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const node = toast ? (
    <Toast
      key={toast.message + Date.now()}
      message={toast.message}
      type={toast.type}
      onDone={() => setToast(null)}
    />
  ) : null;

  return { show, node };
}
