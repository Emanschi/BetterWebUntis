import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * Build-Output liegt bewusst AUSSERHALB des Projektordners (Vorgabe des Auftrags).
 * Siehe PLAN.md Abschnitt 7.
 */
const BUILD_OUT = '/home/emanschi/builds/BetterWebuntis/web';

// Dev-Proxy: der Browser kann WebUntis nicht direkt aufrufen, weil der Server kein
// Access-Control-Allow-Credentials sendet und JSESSIONID HttpOnly ist (siehe TESTING.md).
// Nur `npm run dev` braucht das hier, `vite build` ruft diese Funktion nie auf. Kein
// Fallback mehr auf eine echte Schule (war vorher htlstp) — ohne .env lieber ein klarer
// Fehler beim Start als ein stiller Proxy zur falschen Schule.
function devProxyConfig(env: Record<string, string>) {
  const target = env.VITE_WEBUNTIS_SERVER;
  if (!target) {
    throw new Error(
      'VITE_WEBUNTIS_SERVER fehlt. .env aus .env.example anlegen und auf die eigene Schule einstellen.',
    );
  }
  return {
    // Pfad bewusst exakt "/WebUntis" (Großschreibung wie beim echten Server), OHNE
    // Umschreibung: WebUntis setzt das Session-Cookie mit "Path=/WebUntis" (gemessen,
    // siehe TESTING.md). Pfad-Matching für Cookies ist case-sensitiv — ein Proxy-Pfad
    // wie "/webuntis" (klein), der erst serverseitig umgeschrieben wird, sorgt dafür,
    // dass der Browser (der nur "/webuntis" sieht) das Cookie nie zurückschickt und
    // die Session sofort wieder verloren geht. Echter Bug, gefunden beim ersten Login
    // gegen den echten Server (M10) — hier bewusst vermieden, statt "gefixt".
    '/WebUntis': {
      target,
      changeOrigin: true,
      secure: true,
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    ...(command === 'serve' ? { server: { proxy: devProxyConfig(env) } } : {}),
    build: {
      outDir: BUILD_OUT,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
