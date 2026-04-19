"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js under the betting-discipline-app scope so Chrome
 * treats the site as an installable PWA (WebAPK on Android).
 * No-op on SSR / unsupported browsers.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // 仅在生产环境注册，避免开发态 Next.js 的 HMR 警告
    if (process.env.NODE_ENV !== "production") return;

    const base = "/betting-discipline-app";
    const register = () => {
      navigator.serviceWorker
        .register(`${base}/sw.js`, { scope: `${base}/` })
        .catch(() => {
          // swallow errors — install UX still works on supported browsers
        });
    };

    // 推迟到 load 之后，避免与首屏资源竞争，也能躲开 React hydration 阶段的脚本标签警告
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
