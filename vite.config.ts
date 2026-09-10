import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * Build-Output liegt bewusst AUSSERHALB des Projektordners (Vorgabe des Auftrags).
 * Siehe PLAN.md Abschnitt 7.
 */
const BUILD_OUT = '/home/emanschi/builds/BetterWebuntis/web';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Dev-Proxy: der Browser kann WebUntis nicht direkt aufrufen, weil der Server kein
  // Access-Control-Allow-Credentials sendet und JSESSIONID HttpOnly ist (siehe TESTING.md).
  const target = env.VITE_WEBUNTIS_SERVER ?? 'https://htlstp.webuntis.com';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/webuntis': {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/webuntis/, '/WebUntis'),
        },
      },
    },
    build: {
      outDir: BUILD_OUT,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
