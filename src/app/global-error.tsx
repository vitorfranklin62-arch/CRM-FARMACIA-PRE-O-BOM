"use client";

import { useEffect } from "react";

// Só entra em ação se o próprio layout raiz quebrar (bem raro) — por isso
// precisa dos próprios <html>/<body> e não pode depender de nenhum provider
// do app (tema, etc.), já que esses podem ser a causa do problema.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#F5F6FA",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "#0B1440",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 24,
          }}
        >
          !
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#0B1440", margin: 0 }}>O painel travou</h1>
          <p style={{ fontSize: 14, color: "#5B6472", marginTop: 4, maxWidth: 320 }}>
            Aconteceu um erro grave. Tenta recarregar a página — se continuar, avisa a equipe técnica.
          </p>
        </div>
        <button
          onClick={() => reset()}
          style={{
            background: "#E8483C",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
