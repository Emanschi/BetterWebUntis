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
    // Reihenfolge wichtig: Vite prüft Proxy-Regeln in der Reihenfolge, in der sie hier
    // stehen, und nimmt die erste passende — die spezifischere Route muss deshalb VOR der
    // allgemeinen "/WebUntis" stehen, sonst würde diese jede Anfrage zuerst abfangen.
    //
    // Schulsuche (siehe api/schoolSearchRest.ts, gemessen 2026-09-24, TESTING.md): fest
    // auf WebUntis' eigenen zentralen Suchdienst verdrahtet, unabhängig von
    // VITE_WEBUNTIS_SERVER — der ist ja gerade dafür da, eine BELIEBIGE Schule zu finden,
    // nicht nur die hier lokal konfigurierte. Bewusste Einschränkung: dadurch braucht
    // `npm run dev` für die Schulsuche selbst immer Internetzugang, auch im Mock-Betrieb
    // (`npm run mock` implementiert "/WebUntis/schoolsearch" zwar auch, siehe
    // mock/schoolSearchMock.ts, wird dafür aber nie erreicht) — sonst würde die Suche beim
    // Testen gegen die echte Schule (der eigentliche Zweck dieser Route) leer laufen.
    '/WebUntis/schoolsearch': {
      target: 'https://mobile.webuntis.com',
      changeOrigin: true,
      secure: true,
      rewrite: () => '/ms/schoolquery2',
    },
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // NICHT ueber "command === 'serve'" unterscheiden: vite-node (scripts/mock-server.ts,
  // scripts/smoke-test.ts, siehe package.json) laeuft intern über denselben Vite-Dev-
  // Server-Code und meldet ebenfalls command "serve", obwohl es mit dem Browser-Dev-Proxy
  // nichts zu tun hat und kein VITE_WEBUNTIS_SERVER braucht (gemessen: ctx.command war in
  // beiden Faellen identisch "serve"). npm_lifecycle_event unterscheidet zuverlaessig
  // zwischen den npm-Skripten selbst.
  const isViteDevServer = process.env['npm_lifecycle_event'] === 'dev';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    ...(isViteDevServer ? { server: { proxy: devProxyConfig(env) } } : {}),
    build: {
      outDir: BUILD_OUT,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
