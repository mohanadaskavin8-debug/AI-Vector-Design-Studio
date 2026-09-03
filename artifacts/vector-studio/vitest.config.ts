import { defineConfig } from 'vitest/config';

// Standalone vitest config so tests never load vite.config.ts,
// which requires PORT/BASE_PATH environment variables at import time.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
