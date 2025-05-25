import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 构建时跳过 ESLint 检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 构建时跳过 TypeScript 类型检查
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
