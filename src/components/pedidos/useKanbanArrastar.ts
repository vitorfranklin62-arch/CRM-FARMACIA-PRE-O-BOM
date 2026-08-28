"use client";

import { useCallback, useRef, useState } from "react";

// Distância em pixels que o dedo/mouse precisa percorrer antes de virar
// arrasto de verdade. Sem isso, qualquer toque no cartão já "grudava" o
// pedido no ponteiro e atrapalhava os cliques nos botões.
const DISTANCIA_MINIMA = 6;

export type Arrasto = {
  id: string;
  origem: string;
  /** Posição atual do ponteiro na tela. */
  x: number;
  y: number;
  /** Tamanho do cartão original, pra "fantasma" sair do mesmo tamanho. */
  largura: number;
  altura: number;
  /** Onde o ponteiro pegou o cartão, medido a partir do canto dele. */
  deslocX: number;
  deslocY: number;
  /** Valor do data-alvo que está embaixo do ponteiro agora, se houver. */
  alvo: string | null;
};

function alvoSob(x: number, y: number): string | null {
  const elemento = document.elementFromPoint(x, y);
  const area = elemento?.closest<HTMLElement>("[data-alvo]");
  return area?.dataset.alvo ?? null;
}

/**
 * Arrastar e soltar do quadro de pedidos.
 *
 * Usa eventos de ponteiro (e não a API nativa de drag-and-drop do HTML)
 * porque a nativa simplesmente não existe no touch — e o balcão usa
 * bastante o celular. Aqui mouse e dedo passam pelo mesmo caminho.
 */
export function useKanbanArrastar({
  aoSoltar,
}: {
  aoSoltar: (id: string, alvo: string, origem: string) => void;
}) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const arrastoRef = useRef<Arrasto | null>(null);

  const definirArrasto = useCallback((valor: Arrasto | null) => {
    arrastoRef.current = valor;
    setArrasto(valor);
  }, []);

  const iniciarArrasto = useCallback(
    (evento: React.PointerEvent, dados: { id: string; origem: string }) => {
      // Só botão principal do mouse; toque e caneta passam direto.
      if (evento.pointerType === "mouse" && evento.button !== 0) return;

      const gatilho = evento.currentTarget as HTMLElement;
      const cartao = gatilho.closest<HTMLElement>("[data-cartao]");
      if (!cartao) return;

      const retangulo = cartao.getBoundingClientRect();
      const inicioX = evento.clientX;
      const inicioY = evento.clientY;
      const deslocX = inicioX - retangulo.left;
      const deslocY = inicioY - retangulo.top;
      let iniciado = false;

      const desmontar = () => {
        window.removeEventListener("pointermove", aoMover);
        window.removeEventListener("pointerup", aoSoltarPonteiro);
        window.removeEventListener("pointercancel", aoCancelar);
        window.removeEventListener("keydown", aoTeclar);
        document.body.style.removeProperty("user-select");
      };

      function aoMover(e: PointerEvent) {
        if (!iniciado) {
          if (Math.hypot(e.clientX - inicioX, e.clientY - inicioY) < DISTANCIA_MINIMA) return;
          iniciado = true;
          // Evita seleção de texto no meio do arrasto.
          document.body.style.userSelect = "none";
        }

        definirArrasto({
          id: dados.id,
          origem: dados.origem,
          x: e.clientX,
          y: e.clientY,
          largura: retangulo.width,
          altura: retangulo.height,
          deslocX,
          deslocY,
          alvo: alvoSob(e.clientX, e.clientY),
        });
        e.preventDefault();
      }

      function encerrar(cancelado: boolean) {
        desmontar();
        const atual = arrastoRef.current;
        definirArrasto(null);
        if (!cancelado && atual?.alvo) {
          aoSoltar(atual.id, atual.alvo, atual.origem);
        }
      }

      function aoSoltarPonteiro() {
        encerrar(false);
      }

      function aoCancelar() {
        encerrar(true);
      }

      function aoTeclar(e: KeyboardEvent) {
        if (e.key === "Escape") encerrar(true);
      }

      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerup", aoSoltarPonteiro);
      window.addEventListener("pointercancel", aoCancelar);
      window.addEventListener("keydown", aoTeclar);
    },
    [aoSoltar, definirArrasto]
  );

  return { arrasto, iniciarArrasto };
}
