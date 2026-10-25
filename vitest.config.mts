import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // A few tests (hashing, regex fuzzing, RSA keys) take seconds and slow down when every file runs in parallel.
    testTimeout: 15_000,
  },
});
