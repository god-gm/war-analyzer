/** Sigillo dell'Ordo Malleus: "I" inquisitoriale con teschio e gemma. */
export function Emblem({ size = 64 }: { size?: number }) {
  return (
    <svg
      className="emblem"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sigillo dell'Ordo Malleus"
    >
      <defs>
        <linearGradient id="em-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dc93" />
          <stop offset="0.5" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#7a5a1c" />
        </linearGradient>
        <radialGradient id="em-gem" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ff8a7a" />
          <stop offset="0.45" stopColor="#c0271f" />
          <stop offset="1" stopColor="#4a0707" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#120c0c" stroke="url(#em-gold)" strokeWidth="2" />
      <circle cx="32" cy="32" r="26" fill="none" stroke="#c9a24a" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 3" />
      {/* Pilastro della "I" */}
      <path d="M22 10h20l-3 5h-4.5v34H39l3 5H22l3-5h4.5V15H25z" fill="url(#em-gold)" />
      {/* Barre trasversali */}
      <rect x="16" y="20" width="32" height="3.2" rx="1" fill="url(#em-gold)" />
      <rect x="16" y="41" width="32" height="3.2" rx="1" fill="url(#em-gold)" />
      {/* Teschio */}
      <path
        d="M32 25.5c-4.6 0-7.5 3-7.5 6.8 0 2.3 1.1 3.9 2.6 4.8v2.4h9.8v-2.4c1.5-.9 2.6-2.5 2.6-4.8 0-3.8-2.9-6.8-7.5-6.8z"
        fill="#e9e2cf"
        stroke="#3a2a10"
        strokeWidth="0.8"
      />
      <circle cx="29.2" cy="32.2" r="1.7" fill="#1a0f0f" />
      <circle cx="34.8" cy="32.2" r="1.7" fill="#1a0f0f" />
      <path d="M32 34.2l-1 1.8h2z" fill="#1a0f0f" />
      <path d="M29.5 37.6v1.6M31.2 37.6v1.6M32.8 37.6v1.6M34.5 37.6v1.6" stroke="#3a2a10" strokeWidth="0.6" />
      {/* Gemma */}
      <path d="M32 50.5l2.6 2.6-2.6 2.6-2.6-2.6z" fill="url(#em-gem)" />
      <path d="M32 8.3l2.6 2.6-2.6 2.6-2.6-2.6z" fill="url(#em-gem)" />
    </svg>
  );
}
