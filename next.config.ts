import type { NextConfig } from "next";

// Only apply basePath for production builds (GitHub Pages deployment).
// In dev, serve from "/" so localhost preview opens without 404.
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/betting-discipline-app" : "",
  images: { unoptimized: true },
};

export default nextConfig;
