"use client";

import { useEffect } from "react";

/**
 * Revelação suave dos elementos marcados com [data-reveal] ao entrar na tela.
 * Sem parallax, sem contadores animados — só isso e leve elevação no hover (via CSS).
 * Respeita prefers-reduced-motion (tratado em globals.css) e degrada bem sem JS (noscript).
 */
export function ScrollReveal() {
  useEffect(() => {
    const elementos = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (elementos.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elementos.forEach((el) => el.classList.add("reveal-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    elementos.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
