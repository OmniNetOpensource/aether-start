import { useState } from 'react';
import { Check, Palette, Settings } from '@/frontend/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/design-system/dropdown-menu';
import { useAuthSession } from '@/frontend/auth/client';
import { useTheme } from '@/frontend/app-shell/useTheme';
import { themes } from '@/frontend/themes/registry';
import { SettingsModal } from '../settings-dialog/SettingsModal';

type ProfileMenuProps = {
  onDropdownOpenChange: (open: boolean) => void;
};

export function ProfileMenu(props: ProfileMenuProps) {
  const session = useAuthSession();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const displayName = session.data?.user.name || session.data?.user.email?.split('@')[0] || 'User';
  const subtitle = session.data?.user.email || '已登录';

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) setThemeMenuOpen(false);
    props.onDropdownOpenChange(open);
  };

  return (
    <div className='border-t border-border px-6 py-5'>
      <div className='flex'>
        <div className='mx-auto relative w-full'>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={handleMenuOpenChange}
            positioning={{ placement: 'top-start', gutter: 4 }}
          >
            <DropdownMenuTrigger
              asChild={(triggerProps) => (
                <button
                  {...triggerProps}
                  type='button'
                  className='flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-hover hover:text-foreground'
                >
                  <span className='flex min-w-0 shrink-0 items-center gap-2 overflow-hidden text-left'>
                    <span className='truncate text-sm font-semibold text-foreground'>
                      {displayName}
                    </span>
                  </span>
                </button>
              )}
            />
            <DropdownMenuContent className='min-w-55 p-1'>
              <div className='flex items-center gap-1.5 px-2 py-1.5'>
                <div className='min-w-0 flex-1'>
                  <div className='flex min-w-0 items-center gap-2.5'>
                    <span className='truncate text-sm font-medium text-foreground'>
                      {displayName}
                    </span>
                  </div>
                  <div className='text-xs leading-tight text-muted-foreground'>{subtitle}</div>
                </div>
              </div>

              <div className='-mx-1 my-1 h-px bg-border' />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setThemeMenuOpen((open) => !open);
                }}
              >
                <Palette className='h-4 w-4' />
                主题: {theme.label}
              </DropdownMenuItem>

              {themeMenuOpen &&
                themes.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      setTheme(item);
                    }}
                  >
                    {theme.id === item.id ? (
                      <Check className='h-3.5 w-3.5' />
                    ) : (
                      <span className='h-3.5 w-3.5' />
                    )}
                    <span className='text-xs'>{item.label}</span>
                  </DropdownMenuItem>
                ))}

              <DropdownMenuItem
                onSelect={() => {
                  setSettingsOpen(true);
                }}
              >
                <Settings className='h-4 w-4' />
                设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {settingsOpen ? (
            <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
