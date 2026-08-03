/**
 * Recriação simplificada do ícone da marca (coração + comprimidos) a partir da
 * arte oficial, usando somente os tokens de cor da identidade visual.
 * Só deve aparecer sobre fundo escuro (azul-marinho).
 */
export function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Farmácia Preço Bom"
    >
      <path
        fill="#FE0000"
        d="M52 88C36 76 16 60 16 39c0-13.3 10.7-24 24-24 8.3 0 15.6 4.2 20 10.5C64.4 19.2 71.7 15 80 15c13.3 0 24 10.7 24 24 0 8.6-3.3 16.2-8.2 22.9L52 88Z"
      />
      <path stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" d="M46 26v28M32 40h28" />
      <g transform="translate(83 78) rotate(45)">
        <rect x="-21" y="-10" width="42" height="20" rx="10" fill="#FFFFFF" stroke="#001976" strokeWidth="3" />
        <line x1="0" y1="-9" x2="0" y2="9" stroke="#001976" strokeWidth="3" />
      </g>
      <g transform="translate(70 92) rotate(-25)">
        <rect x="-16" y="-7.5" width="32" height="15" rx="7.5" fill="#FFFFFF" stroke="#001976" strokeWidth="2.5" />
        <line x1="0" y1="-6.5" x2="0" y2="6.5" stroke="#001976" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
