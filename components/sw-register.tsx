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

    const base = "/betting-discipline-app";
    navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .catch(() => {
        // swallow errors — install UX still works on supported browsers
      });
  }, []);

  return null;
}
