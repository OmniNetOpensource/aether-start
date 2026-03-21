import { useEffect, useState } from 'react';
import { Moon, Settings, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/features/auth/client/auth-client';
import { useTheme } from '@/hooks/useTheme';
import { SettingsModal } from './SettingsModal';

type ProfileMenuProps = {
  isCollapsed?: boolean;
  onDropdownOpenChange: (open: boolean) => void;
};

export function ProfileMenu({ isCollapsed = false, onDropdownOpenChange }: ProfileMenuProps) {
  const { data: session } = authClient.useSession();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const displayName = session?.user.name || session?.user.email?.split('@')[0] || 'User';
  const subtitle = session?.user.email || '';

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onDropdownOpenChange(open);
  };

  useEffect(() => {
    return () => {
      onDropdownOpenChange(false);
    };
  }, [onDropdownOpenChange]);

  return (
    <div
      className='border-t ink-border py-5 transition-all duration-500'
      style={{
        paddingLeft: isCollapsed ? 16 : 24,
        paddingRight: isCollapsed ? 16 : 24,
      }}
    >
      <div className='flex'>
        <div
          className='mx-auto relative transition-all duration-500'
          style={{ width: isCollapsed ? 'auto' : '100%' }}
        >
          <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className='flex cursor-pointer items-center gap-3 rounded-md text-sm transition-all duration-500 hover:bg-(--surface-hover) hover:text-foreground'
                style={{
                  width: isCollapsed ? 40 : '100%',
                  height: isCollapsed ? 40 : 'auto',
                  padding: isCollapsed ? 4 : '6px 8px',
                  borderRadius: isCollapsed ? 6 : 6,
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                }}
              >
                <span
                  className={`flex min-w-0 shrink-0 items-center overflow-hidden text-left transition-all duration-500 ${
                    isCollapsed ? 'justify-center' : 'gap-2'
                  }`}
                >
                  <span
                    className='truncate text-sm font-semibold text-foreground'
                    style={{
                      width: isCollapsed ? 'auto' : undefined,
                      maxWidth: isCollapsed ? 24 : undefined,
                    }}
                  >
                    {isCollapsed ? (displayName[0]?.toUpperCase() ?? 'U') : displayName}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side='top' align='start' className='min-w-55 p-1'>
              <div className='flex items-center gap-1.5 px-2 py-1.5'>
                <div className='min-w-0 flex-1'>
                  <div className='flex min-w-0 items-center gap-2.5'>
                    <span className='truncate text-sm font-medium text-foreground'>
                      {displayName}
                    </span>
                  </div>
                  <div className='text-xs leading-tight text-muted-foreground'>
                    {subtitle || '已登录'}
                  </div>
                </div>
              </div>

              <div className='-mx-1 my-1 h-px bg-border' />

              <DropdownMenuItem onSelect={toggleTheme}>
                {theme === 'dark' ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
                {theme === 'dark' ? '浅色模式' : '深色模式'}
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings className='h-4 w-4' />
                设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </div>
    </div>
  );
}
