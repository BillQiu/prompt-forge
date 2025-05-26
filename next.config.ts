import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出配置，用于GitHub Pages部署
  output: "export",
  basePath: "/prompt-forge",
  trailingSlash: true,
  images: {
    unoptimized: true, // GitHub Pages不支持Next.js图片优化
  },

  // 构建时跳过 ESLint 检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 构建时跳过 TypeScript 类型检查
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
