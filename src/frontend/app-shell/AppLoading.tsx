export function AppLoading() {
  return (
    <main
      className='flex h-screen w-screen items-center justify-center bg-background text-foreground'
      role='status'
      aria-label='正在加载'
    >
      <svg
        className='size-20'
        viewBox='0 0 72 72'
        fill='none'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
      >
        <path
          className='aether-loading-a'
          pathLength='1'
          d='M10 62 C18 47 28 23 36 10 C43 24 53 47 62 62 C57 51 53 43 50 38 C41 39 32 39 23 41'
        />
      </svg>
      <style>{`
        .aether-loading-a {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: draw-a 1.8s ease-in-out infinite;
        }

        @keyframes draw-a {
          0%, 10% { stroke-dashoffset: 1; opacity: 1; }
          72%, 82% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
      `}</style>
    </main>
  );
}
