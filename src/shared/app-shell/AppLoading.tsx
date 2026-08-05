import { Loader2 } from 'lucide-react';
import { AetherLogo } from '@/shared/app-shell/AetherLogo';

export function AppLoading() {
  return (
    <main
      className='flex h-screen w-screen items-center justify-center bg-background text-foreground'
      role='status'
      aria-label='正在加载'
    >
      <div className='flex flex-col items-center gap-3'>
        <AetherLogo className='h-7 w-auto' />
        <Loader2 className='size-4 animate-spin text-muted-foreground' aria-hidden />
      </div>
    </main>
  );
}
