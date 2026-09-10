import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Node bleibt der Default (schneller, und import.meta.url-basierte Fixture-Pfade
    // verhalten sich unter jsdom anders). Komponententests, die ein DOM brauchen,
    // setzen an den Dateianfang: `// @vitest-environment jsdom`
    environment: 'node',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: { reportsDirectory: '/home/emanschi/builds/BetterWebuntis/coverage' },
  },
});
