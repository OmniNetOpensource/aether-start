export function NewChatGreeting() {
  return (
    <div
      class='absolute inset-0 flex flex-col items-center px-4 font-serif'
      style={{ 'padding-top': '8vh' }}
    >
      <div class='flex items-center gap-1 sm:gap-2 text-2xl sm:text-3xl font-medium text-muted-foreground'>
        <span>今天想</span>
        <div class='relative h-[1.2em] overflow-hidden text-foreground'>
          <div
            class='flex flex-col'
            style={{ animation: 'scrollUp 12s cubic-bezier(0.4,0,0.2,1) infinite' }}
          >
            <span class='flex h-[1.2em] items-center'>探索</span>
            <span class='flex h-[1.2em] items-center'>创造</span>
            <span class='flex h-[1.2em] items-center'>学习</span>
            <span class='flex h-[1.2em] items-center'>发现</span>
            <span class='flex h-[1.2em] items-center'>探索</span>
          </div>
        </div>
        <span>些什么？</span>
      </div>
      <style>{`
        @keyframes scrollUp {
          0%, 20% { transform: translateY(0); }
          25%, 45% { transform: translateY(-1.2em); }
          50%, 70% { transform: translateY(-2.4em); }
          75%, 95% { transform: translateY(-3.6em); }
          100% { transform: translateY(-4.8em); }
        }
      `}</style>
    </div>
  );
}
