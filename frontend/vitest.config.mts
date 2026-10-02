import { defineConfig } from "vitest/config";

// Unit tests for pure modules (lib/): no DOM, no Next.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
