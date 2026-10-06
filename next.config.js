/** @type {import('next').NextConfig} */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: { unoptimized: true },
  // AI API 需要 Node.js / Serverless 运行时，不再使用纯静态导出。
  ...(BASE_PATH
    ? {
        basePath: BASE_PATH,
        assetPrefix: `${BASE_PATH}/`,
      }
    : {}),
  env: {
    // 传给 pages/_app.js 的 SW 注册与 manifest 引用
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  trailingSlash: true,
  // The server-side goutoujunshi adapter reads a small allowlisted set of
  // upstream Markdown references at request time; keep them in deployments.
  outputFileTracingIncludes: {
    "/api/profile": ["./vendor/goutoujunshi/**/*"],
  },
};

module.exports = nextConfig;
