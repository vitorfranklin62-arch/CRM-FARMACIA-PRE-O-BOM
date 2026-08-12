export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <path
        fill="#E8483C"
        d="M12 20.6C9.4 19 3 14.6 3 9.6 3 6.8 5.1 4.6 7.9 4.6c1.8 0 3.4 1 4.1 2.4.7-1.4 2.3-2.4 4.1-2.4 2.8 0 5 2.2 5 5 0 5-6.4 9.4-9.1 11Z"
      />
      <path
        fill="#fff"
        d="M10.85 8.2h2.3v1.95H15.1v2.3h-1.95V14.4h-2.3v-1.95H8.9v-2.3h1.95Z"
      />
      <g transform="translate(15.6 14.4) rotate(45)">
        <rect x="-4.6" y="-2.3" width="9.2" height="4.6" rx="2.3" fill="#fff" stroke="#0B1440" strokeWidth="0.8" />
        <line x1="0" y1="-2.1" x2="0" y2="2.1" stroke="#0B1440" strokeWidth="0.8" />
      </g>
    </svg>
  );
}
