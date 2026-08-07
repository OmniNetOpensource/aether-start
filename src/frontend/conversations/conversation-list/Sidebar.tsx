import { onSettled } from 'solid-js';
import { AetherLogo } from '@/frontend/app-shell/AetherLogo';
import { NewChatButton } from '@/frontend/conversations/conversation-list/NewChatButton';
import { useResponsive } from '@/frontend/app-shell/ResponsiveContext';
import { ConversationList } from '@/frontend/conversations/conversation-list';
import { ConversationSearchTrigger } from '@/frontend/conversations/conversation-search';
import { ProfileMenu } from '@/frontend/settings/profile-menu';

export default function Sidebar() {
  const RIGHT_LEAVE_TOLERANCE_PX = 1;
  let sidebar: HTMLElement | undefined;
  let openDropdown = false;
  const deviceType = useResponsive();
  const isMobile = () => deviceType() === 'mobile';

  const handleDropdownOpenChange = (open: boolean) => {
    openDropdown = open;
  };

  const isSidebarOpen = () => {
    return !sidebar?.classList.contains('-translate-x-full');
  };

  const openSidebar = () => {
    sidebar?.classList.remove('-translate-x-full');
  };

  const handleSidebarTriggerClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openSidebar();
  };

  const closeSidebar = () => {
    openDropdown = false;
    sidebar?.classList.add('-translate-x-full');
  };

  const handleMouseLeave = (event: MouseEvent & { currentTarget: HTMLElement }) => {
    if (isMobile()) {
      return;
    }

    if (openDropdown) {
      return;
    }

    const { right } = event.currentTarget.getBoundingClientRect();
    const leftFromRightSide = event.clientX >= right - RIGHT_LEAVE_TOLERANCE_PX;

    if (leftFromRightSide) {
      closeSidebar();
    }
  };

  onSettled(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (
        isSidebarOpen() &&
        sidebar &&
        event.target instanceof Node &&
        !sidebar.contains(event.target)
      ) {
        if (event.target instanceof Element && event.target.closest('[role="menu"]')) {
          return;
        }

        closeSidebar();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  });

  onSettled(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isSidebarOpen()) {
        closeSidebar();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  });

  return (
    <div class='relative z-(--z-sidebar) h-full w-0 shrink-0 group/sidebar-trigger'>
      <div
        class='absolute left-0 top-0 z-(--z-sidebar) h-full w-4'
        onClick={isMobile() ? handleSidebarTriggerClick : undefined}
        onMouseEnter={isMobile() ? undefined : openSidebar}
        aria-label='展开侧边栏'
      />
      <div class='pointer-events-none absolute left-0 top-1/2 z-(--z-sidebar) h-24 w-2 -translate-y-1/2 rounded-r-md bg-border transition-[width,background-color] duration-300 group-hover/sidebar-trigger:w-2.5 group-hover/sidebar-trigger:bg-border' />

      <aside
        ref={(element) => {
          sidebar = element;
        }}
        class='absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 -translate-x-full flex-col overflow-hidden border-r border-border/25 bg-surface transition-transform duration-300 ease-[var(--transition-smooth)] md:w-[22vw] md:min-w-65 md:max-w-90'
        onMouseLeave={isMobile() ? undefined : handleMouseLeave}
      >
        <div class='flex h-20 shrink-0 items-center px-6'>
          <AetherLogo class='h-5 text-foreground/90' />
        </div>

        <div class='flex flex-col gap-2 px-6 pt-2'>
          <NewChatButton />
          <ConversationSearchTrigger variant='sidebar' />
        </div>

        <div class='relative min-h-0 flex-1'>
          <div class='pointer-events-none absolute left-0 right-0 top-0 z-10 h-6 bg-gradient-to-b from-surface to-transparent' />
          <div class='flex h-full min-h-0 flex-col px-6 py-6'>
            <div class='flex h-full min-h-0 flex-col gap-4 overflow-hidden'>
              <ConversationList onDropdownOpenChange={handleDropdownOpenChange} />
            </div>
          </div>
          <div class='pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-6 bg-gradient-to-t from-surface to-transparent' />
        </div>

        <ProfileMenu onDropdownOpenChange={handleDropdownOpenChange} />
      </aside>
    </div>
  );
}
