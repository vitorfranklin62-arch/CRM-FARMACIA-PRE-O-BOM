/**
 * Avatar ilustrado da "Vitória" (persona do ATLAS AI) — desenho simplificado
 * em SVG, na paleta navy/coral da marca, sem depender de nenhuma imagem
 * externa (mesmo espírito do LogoMark).
 */
export function AtlasAvatar({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="atlasAvatarBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1B2260" />
          <stop offset="100%" stopColor="#0B1440" />
        </linearGradient>
      </defs>

      <circle cx="48" cy="48" r="48" fill="url(#atlasAvatarBg)" />

      {/* Jaleco */}
      <path d="M20 96 C20 72 32 63 48 63 C64 63 76 72 76 96 Z" fill="#F7F9FC" />
      <path d="M39 64 L48 78 L57 64" fill="none" stroke="#D6DAF0" strokeWidth="2" />

      {/* Marquinha da farmácia no jaleco */}
      <path
        transform="translate(44 82) scale(0.62)"
        fill="#E8483C"
        d="M12 20.6C9.4 19 3 14.6 3 9.6 3 6.8 5.1 4.6 7.9 4.6c1.8 0 3.4 1 4.1 2.4.7-1.4 2.3-2.4 4.1-2.4 2.8 0 5 2.2 5 5 0 5-6.4 9.4-9.1 11Z"
      />

      {/* Pescoço */}
      <rect x="41" y="54" width="14" height="15" rx="5" fill="#E3AE87" />

      {/* Cabelo (atrás) */}
      <path
        d="M20 50 C20 26 32 12 48 12 C64 12 76 26 76 50 L71 59 C71 37 61 24 48 24 C35 24 25 37 25 59 Z"
        fill="#2B1D16"
      />

      {/* Rosto */}
      <circle cx="48" cy="41" r="19" fill="#E8B592" />

      {/* Cabelo (franja) */}
      <path
        d="M29 37 C29 21 37 12 48 12 C59 12 67 21 67 37 C60 28 54 25 48 25 C42 25 36 28 29 37Z"
        fill="#2B1D16"
      />

      {/* Óculos */}
      <g stroke="#0B1440" strokeWidth="2.2" fill="none" strokeLinejoin="round">
        <rect x="31" y="39" width="15" height="11" rx="4" />
        <rect x="50" y="39" width="15" height="11" rx="4" />
        <line x1="46" y1="44.5" x2="50" y2="44.5" />
        <line x1="29" y1="41" x2="25" y2="39" strokeLinecap="round" />
        <line x1="67" y1="41" x2="71" y2="39" strokeLinecap="round" />
      </g>

      {/* Sorriso */}
      <path d="M41 53 Q48 58 55 53" stroke="#8A5236" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* Brinco */}
      <circle cx="29" cy="47" r="1.6" fill="#F1D9A8" />
    </svg>
  );
}
