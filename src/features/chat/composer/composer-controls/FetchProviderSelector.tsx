'use client';
import { Check, ChevronDown, Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/design-system/dropdown-menu';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { useChatSessionStore } from '@/features/conversations/session';

type FetchProvider = 'jina' | 'firecrawl' | 'exa';

const PROVIDERS: { id: FetchProvider; name: string }[] = [
  { id: 'jina', name: 'Jina' },
  { id: 'firecrawl', name: 'Firecrawl' },
  { id: 'exa', name: 'Exa' },
];

export function FetchProviderSelector() {
  // currentFetchProvider 由 useChatSessionStore 的 persist 中间件 hydrate。
  const currentFetchProvider = useChatSessionStore((state) => state.currentFetchProvider);
  const setCurrentFetchProvider = useChatSessionStore((state) => state.setCurrentFetchProvider);

  const currentName = PROVIDERS.find((p) => p.id === currentFetchProvider)?.name ?? 'Jina';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-label={`选择抓取服务，当前为 ${currentName}`}
          title={`Fetch: ${currentName}`}
          className={cn(
            'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground',
            'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
          )}
        >
          <Globe className='h-3.5 w-3.5' />
          <span className='hidden @[921px]:inline-flex items-center gap-1.5'>
            <span className='max-w-20 truncate'>{currentName}</span>
            <ChevronDown className='h-3 w-3 transition-transform duration-300' />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' sideOffset={4}>
        {PROVIDERS.map((provider) => (
          <DropdownMenuItem key={provider.id} onSelect={() => setCurrentFetchProvider(provider.id)}>
            <span className='flex-1 truncate'>{provider.name}</span>
            {currentFetchProvider === provider.id && <Check className='h-4 w-4 shrink-0' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
