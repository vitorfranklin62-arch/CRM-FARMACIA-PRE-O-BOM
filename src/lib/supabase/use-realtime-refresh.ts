"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Atualiza a página (router.refresh) sempre que alguma linha da tabela muda
 * no banco — é o que faz os quadros refletirem, ao vivo, o que outra pessoa
 * (ou o N8N) fez em outro aparelho.
 */
export function useRealtimeRefresh(tabela: string) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`${tabela}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabela }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tabela, router]);
}
