import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The generator (jsonnet + python) is invoked via child_process from API
  // routes; nothing here must be bundled from outside presale-app/.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
