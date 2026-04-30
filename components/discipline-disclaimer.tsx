"use client";

import { useEffect, useState } from "react";
import { matchDayKey } from "@/lib/types";

const STORAGE_KEY = "bda_last_disclaimer_match_day";
const READ_SECONDS = 3;

/**
 * 大字纪律提醒弹窗。
 *  - mode="daily"：每个 match-day（10am→10am）首次打开应用时弹一次（用 localStorage 去重）。
 *  - mode="always"：每次挂载都弹（用于"纪律审查"页）。
 *  - 必须读完 3 秒倒计时按钮才能关；遮罩与 Esc 不响应。
 */
export default function DisciplineDisclaimer({ mode }: { mode: "daily" | "always" }) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(READ_SECONDS);

  // 决定是否需要弹（仅挂载时判定一次）
  useEffect(() => {
    if (mode === "always") {
      setOpen(true);
      setRemaining(READ_SECONDS);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      const today = matchDayKey(new Date());
      if (last !== today) {
        setOpen(true);
        setRemaining(READ_SECONDS);
      }
    } catch {
      // localStorage 不可用就直接弹（保守）
      setOpen(true);
      setRemaining(READ_SECONDS);
    }
  }, [mode]);

  // 倒计时
  useEffect(() => {
    if (!open || remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [open, remaining]);

  // Esc 不响应：拦截，避免与其他模态键映射冲突
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const close = () => {
    if (remaining > 0) return;
    if (mode === "daily" && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, matchDayKey(new Date()));
      } catch { /* ignore */ }
    }
    setOpen(false);
  };

  if (!open) return null;

  const canClose = remaining <= 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/85">
      <div className="relative w-full max-w-[420px] bg-background rounded-2xl border border-border shadow-2xl px-6 py-8">
        <div className="space-y-5 text-center">
          <p className="text-[20px] font-black leading-tight text-foreground">
            长期计划<br />
            <span className="text-muted-foreground/80 text-[15px] font-bold">
              不强求一两场得失
            </span>
          </p>

          <div className="h-px bg-border/60 mx-8" />

          <p className="text-[20px] font-black leading-tight text-loss">
            输一场要赢两场<br />
            <span className="text-muted-foreground/80 text-[15px] font-bold">
              才能回到盈利
            </span>
          </p>

          <div className="h-px bg-border/60 mx-8" />

          <div className="text-[28px] font-black tracking-[0.4em] text-warning leading-snug">
            <p>控　手</p>
            <p>控　手</p>
            <p>控　手</p>
          </div>
        </div>

        <button
          onClick={close}
          disabled={!canClose}
          className={`mt-7 w-full py-3 rounded-xl text-[15px] font-bold transition-colors ${
            canClose
              ? "bg-foreground text-background active:opacity-70"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {canClose ? "我已读，开始" : `⏳ 阅读中 ${remaining}`}
        </button>
      </div>
    </div>
  );
}
