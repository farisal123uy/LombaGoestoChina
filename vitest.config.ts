import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    include: ["tests/integration/**/*.test.ts"],
  },
});
