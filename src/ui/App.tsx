import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './router';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // WebUntis drosselt bei Lastspitzen (PLAN.md R7) — nicht bei jedem Fokuswechsel neu laden.
        refetchOnWindowFocus: false,
        staleTime: 60_000,
        retry: 1,
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
