import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only. Bottom-left (the default) covers the account avatar at the foot
  // of the workspace rail; top-right would cover the title bar's actions.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
