import { ChevronLeft, ChevronRight } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import type { BranchInfo } from '@/shared/chat/message';

type BranchNavigatorProps = {
  branchInfo: BranchInfo;
  onNavigate: (direction: 'prev' | 'next') => void;
  disabled?: boolean;
};

export function BranchNavigator(props: BranchNavigatorProps) {
  const currentIndex = () => props.branchInfo.currentIndex;
  const total = () => props.branchInfo.total;

  return (
    <>
      {total() > 1 && (
        <div class='flex items-center gap-1 text-xs text-muted-foreground'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            class='h-6 w-6'
            aria-label='上一条分支'
            disabled={(props.disabled ?? false) || currentIndex() === 0}
            onClick={() => props.onNavigate('prev')}
          >
            <ChevronLeft class='h-3.5 w-3.5' />
          </Button>
          <span class='min-w-[36px] text-center'>
            {currentIndex() + 1}/{total()}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            class='h-6 w-6'
            aria-label='下一条分支'
            disabled={(props.disabled ?? false) || currentIndex() === total() - 1}
            onClick={() => props.onNavigate('next')}
          >
            <ChevronRight class='h-3.5 w-3.5' />
          </Button>
        </div>
      )}
    </>
  );
}
