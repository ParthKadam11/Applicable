import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "web/src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    environment: "node",
  },
});
