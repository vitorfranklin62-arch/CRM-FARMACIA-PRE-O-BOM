"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Cache de dados no navegador (TanStack Query). No Chat ao vivo, os eventos do
 * Supabase Realtime atualizam esse cache direto — a tela não precisa refazer
 * a consulta inteira (nem recarregar a página) a cada mensagem.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Quem mantém os dados em dia é o Realtime; refazer a consulta a cada
            // foco de janela só geraria tráfego. A ressincronização depois de
            // queda de conexão/aba parada é feita no ChatRealtimeProvider.
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
