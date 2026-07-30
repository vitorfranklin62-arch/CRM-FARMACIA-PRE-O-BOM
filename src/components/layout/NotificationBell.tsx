"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Volume1, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Volume = "mudo" | "medio" | "alto";

const VOLUME_GAIN: Record<Volume, number> = { mudo: 0, medio: 0.15, alto: 0.4 };
const VOLUME_LABEL: Record<Volume, string> = { mudo: "Mudo", medio: "Médio", alto: "Alto" };
const STORAGE_KEY = "precobom-notif-volume";

function playChime(gain: number) {
  if (gain <= 0) return;
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.15;
      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(gain, start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gainNode).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    setTimeout(() => ctx.close(), 800);
  } catch {
    // Web Audio indisponível ou bloqueado pelo navegador — silencioso, sem quebrar o app
  }
}

export function NotificationBell() {
  const [volume, setVolume] = useState<Volume>("medio");
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const volumeRef = useRef<Volume>("medio");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Volume | null;
    if (saved && saved in VOLUME_GAIN) {
      setVolume(saved);
      volumeRef.current = saved;
    }
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pedidos-notificacoes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos" }, () => {
        playChime(VOLUME_GAIN[volumeRef.current]);
        setPulse(true);
        setTimeout(() => setPulse(false), 2000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function selecionarVolume(v: Volume) {
    setVolume(v);
    volumeRef.current = v;
    localStorage.setItem(STORAGE_KEY, v);
    if (v !== "mudo") playChime(VOLUME_GAIN[v]);
    setOpen(false);
  }

  const Icon = volume === "mudo" ? BellOff : Bell;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notificações de novo pedido"
        className={cn(
          "rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200",
          pulse && "text-accent-500 dark:text-accent-400"
        )}
      >
        <Icon size={18} className={cn(pulse && "animate-bounce")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-48 rounded-xl border border-gray-100 bg-white p-1.5 shadow-card dark:border-white/10 dark:bg-navy-800">
          <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Som de novo pedido
          </p>
          {(Object.keys(VOLUME_GAIN) as Volume[]).map((v) => {
            const VIcon = v === "mudo" ? BellOff : v === "medio" ? Volume1 : Volume2;
            return (
              <button
                key={v}
                onClick={() => selecionarVolume(v)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition",
                  volume === v
                    ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                )}
              >
                <VIcon size={15} />
                {VOLUME_LABEL[v]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
