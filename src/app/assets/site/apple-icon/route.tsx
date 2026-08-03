import { ImageResponse } from "next/og";

/** Ícone de atalho iOS gerado dinamicamente. Troque por `apple-icon-180.png` real quando disponível. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#001976",
        }}
      >
        <svg viewBox="0 0 120 120" width="140" height="140">
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
      </div>
    ),
    { width: 180, height: 180 }
  );
}
