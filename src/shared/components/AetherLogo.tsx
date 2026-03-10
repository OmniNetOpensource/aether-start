interface AetherLogoProps {
  className?: string
}

export function AetherLogo({ className = '' }: AetherLogoProps) {
  return (
    <svg
      viewBox="0 0 100 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* A */}
      <path d="M 2 28 C 3 10 7 4 9 4 C 11 4 15 10 14 28" />
      <path d="M 4 21 C 7 18 11 18 13 20" />
      {/* e */}
      <path d="M 16 22 L 26 20 C 26 14 16 14 16 22 C 16 30 26 28 26 24" />
      {/* t */}
      <path d="M 34 8 C 33 14 32 20 32 28 C 32 32 38 32 38 28" />
      <path d="M 28 18 L 38 18" />
      {/* h */}
      <path d="M 42 8 L 42 28" />
      <path d="M 42 18 C 42 14 52 14 52 20 L 52 28" />
      {/* e */}
      <path d="M 56 22 L 66 20 C 66 14 56 14 56 22 C 56 30 66 28 66 24" />
      {/* r */}
      <path d="M 70 18 L 70 28" />
      <path d="M 70 20 C 70 14 78 14 78 18" />
    </svg>
  )
}
