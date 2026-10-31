import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // A few tests (hashing, regex fuzzing, RSA keys) take seconds and slow down when every file runs in parallel.
    testTimeout: 15_000,
    // Installed agent skills ship their own tests for other runners.
    exclude: [...configDefaults.exclude, ".agents/**", ".claude/**"],
  },
});
