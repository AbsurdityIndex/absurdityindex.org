import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/votechain/**/*.test.ts'],
    setupFiles: ['tests/votechain/setup.ts'],
    // Node 20+ provides crypto.subtle, atob, btoa, TextEncoder, TextDecoder
    // natively — only localStorage needs mocking (see setup.ts).
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      // Allow imports like '../encoding.js' to resolve to .ts files
    },
    extensions: ['.ts', '.js'],
  },
});
