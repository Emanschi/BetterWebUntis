import { useState } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isBadCredentials, isMissingRight, isNotAuthenticated } from '../api/errors';
import { useSessionStore } from '../state/sessionStore';
import { AppRouter } from './router';

function createQueryClient(): QueryClient {
  return new QueryClient({
    // Betrifft vor allem die per "Angemeldet bleiben" (sessionStore.ts) wiederhergestellte
    // Sitzung: ob das Browser-Cookie noch gueltig ist, zeigt sich erst am ersten echten
    // API-Aufruf. Schlaegt IRGENDEINE Query mit "nicht angemeldet" fehl, gilt das fuer die
    // ganze Sitzung (ein Cookie, ein Server) -- zentral hier statt in jedem Screen einzeln
    // auf sessionExpired() reagieren.
    queryCache: new QueryCache({
      onError: (error) => {
        if (isNotAuthenticated(error)) useSessionStore.getState().sessionExpired();
      },
    }),
    defaultOptions: {
      queries: {
        // WebUntis drosselt bei Lastspitzen (PLAN.md R7) — nicht bei jedem Fokuswechsel neu laden.
        refetchOnWindowFocus: false,
        staleTime: 60_000,
        // Fehlende Rechte, eine abgelaufene Session oder falsche Zugangsdaten beheben
        // sich durch Wiederholen nicht (PLAN.md R4) — ein Retry verzögert dort nur
        // unnötig die Fehleranzeige. Nur bei sonstigen (z. B. Netzwerk-)Fehlern einmal
        // erneut versuchen.
        retry: (failureCount, error) =>
          failureCount < 1 && !isMissingRight(error) && !isNotAuthenticated(error) && !isBadCredentials(error),
      },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}
