import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@guardian-wallet/shared"],
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
};

export default nextConfig;
