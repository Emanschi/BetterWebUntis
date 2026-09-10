import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isBadCredentials, isMissingRight, isNotAuthenticated } from '../api/errors';
import { AppRouter } from './router';

function createQueryClient(): QueryClient {
  return new QueryClient({
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
