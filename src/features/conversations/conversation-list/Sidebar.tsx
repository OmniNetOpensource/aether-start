import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { AetherLogo } from '@/shared/app-shell/AetherLogo';
import { NewChatButton } from '@/features/chat/session';
import { useResponsive } from '@/shared/app-shell/ResponsiveContext';
import { NotesButton } from '@/features/notes/note-list';
import { ConversationList } from '@/features/conversations/conversation-list';
import { ConversationSearchTrigger } from '@/features/conversations/conversation-search';
import { ProfileMenu } from '@/features/settings/profile-menu';

export default function Sidebar() {
  const RIGHT_LEAVE_TOLERANCE_PX = 1;
  const sidebarRef = useRef<HTMLElement>(null);
  const openDropdownRef = useRef(false);
  const deviceType = useResponsive();
  const isMobile = deviceType === 'mobile';

  const handleDropdownOpenChange = (open: boolean) => {
    openDropdownRef.current = open;
  };

  const isSidebarOpen = () => {
    return !sidebarRef.current?.classList.contains('-translate-x-full');
  };

  const openSidebar = () => {
    sidebarRef.current?.classList.remove('-translate-x-full');
    document.body.style.overflow = 'hidden';
  };

  const handleSidebarTriggerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openSidebar();
  };

  const closeSidebar = () => {
    openDropdownRef.current = false;
    sidebarRef.current?.classList.add('-translate-x-full');
    document.body.style.overflow = '';
  };

  const handleMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    if (isMobile) {
      return;
    }

    if (openDropdownRef.current) {
      return;
    }

    const { right } = event.currentTarget.getBoundingClientRect();
    const leftFromRightSide = event.clientX >= right - RIGHT_LEAVE_TOLERANCE_PX;

    if (leftFromRightSide) {
      closeSidebar();
    }
  };

  useMountEffect(() => {
    const closeSidebarFromOutside = () => {
      openDropdownRef.current = false;
      sidebarRef.current?.classList.add('-translate-x-full');
      document.body.style.overflow = '';
    };

    const handlePointerDownOutside = (event: PointerEvent) => {
      if (
        isSidebarOpen() &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        if ((event.target as Element).closest?.('[data-radix-popper-content-wrapper]')) {
          return;
        }

        closeSidebarFromOutside();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  });

  useMountEffect(() => {
    const closeSidebarOnEscape = () => {
      openDropdownRef.current = false;
      sidebarRef.current?.classList.add('-translate-x-full');
      document.body.style.overflow = '';
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isSidebarOpen()) {
        closeSidebarOnEscape();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  });

  useMountEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  });

  return (
    <div className='relative z-(--z-sidebar) h-full w-0 shrink-0 group/sidebar-trigger'>
      <div
        className='absolute left-0 top-0 z-(--z-sidebar) h-full w-4'
        onClick={isMobile ? handleSidebarTriggerClick : undefined}
        onMouseEnter={isMobile ? undefined : openSidebar}
        aria-label='展开侧边栏'
      />
      <div className='pointer-events-none absolute left-0 top-1/2 z-(--z-sidebar) h-24 w-2 -translate-y-1/2 rounded-r-md bg-border transition-all duration-300 group-hover/sidebar-trigger:w-2.5 group-hover/sidebar-trigger:bg-(--border-primary)' />

      <aside
        ref={sidebarRef}
        className='absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 -translate-x-full flex-col overflow-hidden bg-(--sidebar-surface) shadow-[2px_0_8px_-2px_#e8e8e8] transition-transform duration-300 ease-[var(--transition-smooth)] dark:shadow-[2px_0_8px_-2px_#0a0a0a] md:w-[22vw] md:min-w-65 md:max-w-90'
        onMouseLeave={isMobile ? undefined : handleMouseLeave}
      >
        <div className='flex h-20 shrink-0 items-center px-6'>
          <AetherLogo className='h-5 text-foreground/90' />
        </div>

        <div className='flex flex-col gap-2 px-6 pt-2'>
          <NewChatButton isCollapsed={false} />
          <ConversationSearchTrigger variant='sidebar' />
          <NotesButton />
        </div>

        <div className='relative min-h-0 flex-1'>
          <div className='pointer-events-none absolute left-0 right-0 top-0 z-10 h-6 bg-gradient-to-b from-(--sidebar-surface) to-transparent' />
          <div className='flex h-full min-h-0 flex-col px-6 py-6'>
            <div className='flex h-full min-h-0 flex-col gap-4 overflow-hidden'>
              <ConversationList onDropdownOpenChange={handleDropdownOpenChange} />
            </div>
          </div>
          <div className='pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-6 bg-gradient-to-t from-(--sidebar-surface) to-transparent' />
        </div>

        <ProfileMenu isCollapsed={false} onDropdownOpenChange={handleDropdownOpenChange} />
      </aside>
    </div>
  );
}
