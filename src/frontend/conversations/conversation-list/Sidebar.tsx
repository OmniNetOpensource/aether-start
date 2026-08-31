import { useEffect, useRef, type MouseEvent } from 'react';
import { AetherLogo } from '@/frontend/app-shell/AetherLogo';
import { Link } from '@tanstack/react-router';
import { Pencil } from '@/frontend/design-system/icons';
import { buttonVariants } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import { useResponsive } from '@/frontend/app-shell/ResponsiveContext';
import { ConversationList } from '@/frontend/conversations/conversation-list';
import { ConversationSearchTrigger } from '@/frontend/conversations/conversation-search';
import { ProfileMenu } from '@/frontend/settings/profile-menu';

const RIGHT_LEAVE_TOLERANCE_PX = 1;

export default function Sidebar() {
  const sidebar = useRef<HTMLElement>(null);
  const openDropdown = useRef(false);
  const deviceType = useResponsive();
  const isMobile = deviceType === 'mobile';

  const handleDropdownOpenChange = (open: boolean) => {
    openDropdown.current = open;
  };

  const openSidebar = () => {
    sidebar.current?.classList.remove('-translate-x-full');
  };

  const handleSidebarTriggerClick = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openSidebar();
  };

  const closeSidebar = () => {
    openDropdown.current = false;
    sidebar.current?.classList.add('-translate-x-full');
  };

  const handleMouseLeave = (event: MouseEvent<HTMLElement>) => {
    if (isMobile) {
      return;
    }

    if (openDropdown.current) {
      return;
    }

    const { right } = event.currentTarget.getBoundingClientRect();
    const leftFromRightSide = event.clientX >= right - RIGHT_LEAVE_TOLERANCE_PX;

    if (leftFromRightSide) {
      closeSidebar();
    }
  };

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      const element = sidebar.current;
      if (
        element &&
        !element.classList.contains('-translate-x-full') &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        if (event.target instanceof Element && event.target.closest('[role="menu"]')) {
          return;
        }

        openDropdown.current = false;
        element.classList.add('-translate-x-full');
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sidebar.current?.classList.contains('-translate-x-full')) {
        openDropdown.current = false;
        sidebar.current?.classList.add('-translate-x-full');
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div className='relative z-(--z-sidebar) h-full w-0 shrink-0 group/sidebar-trigger'>
      <div
        className='absolute left-0 top-0 z-(--z-sidebar) h-full w-4'
        onClick={isMobile ? handleSidebarTriggerClick : undefined}
        onMouseEnter={isMobile ? undefined : openSidebar}
        aria-label='展开侧边栏'
      />
      <div className='pointer-events-none absolute left-0 top-1/2 z-(--z-sidebar) h-24 w-2 -translate-y-1/2 rounded-r-md bg-border transition-[width,background-color] duration-300 group-hover/sidebar-trigger:w-2.5 group-hover/sidebar-trigger:bg-border' />

      <aside
        ref={sidebar}
        className='absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 -translate-x-full flex-col overflow-hidden border-r border-border/25 bg-surface transition-transform duration-300 ease-[var(--transition-smooth)] md:w-[22vw] md:min-w-65 md:max-w-90'
        onMouseLeave={isMobile ? undefined : handleMouseLeave}
      >
        <div className='flex h-20 shrink-0 items-center px-6'>
          <AetherLogo className='h-5 text-foreground/90' />
        </div>

        <div className='flex flex-col gap-2 px-6 pt-2'>
          <Link
            to='/app'
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'default' }),
              'group relative h-10 w-full overflow-hidden transition-all duration-300',
              'justify-start px-3 rounded-md border border-border bg-muted text-foreground shadow-xs hover:shadow-sm hover:bg-hover',
            )}
            aria-label='新对话'
          >
            <span className='flex h-10 w-10 shrink-0 items-center justify-center'>
              <Pencil className='h-5 w-5 transition-transform duration-300 group-hover:rotate-90' />
            </span>
            <span className='whitespace-nowrap text-sm font-medium'>新对话</span>
          </Link>
          <ConversationSearchTrigger variant='sidebar' />
        </div>

        <div className='relative min-h-0 flex-1'>
          <div className='pointer-events-none absolute left-0 right-0 top-0 z-10 h-6 bg-gradient-to-b from-surface to-transparent' />
          <div className='flex h-full min-h-0 flex-col px-6 py-6'>
            <div className='flex h-full min-h-0 flex-col gap-4 overflow-hidden'>
              <ConversationList onDropdownOpenChange={handleDropdownOpenChange} />
            </div>
          </div>
          <div className='pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-6 bg-gradient-to-t from-surface to-transparent' />
        </div>

        <ProfileMenu onDropdownOpenChange={handleDropdownOpenChange} />
      </aside>
    </div>
  );
}
