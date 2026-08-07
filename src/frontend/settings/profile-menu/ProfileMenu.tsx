import { createSignal, For, onSettled } from 'solid-js';
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
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [themeMenuOpen, setThemeMenuOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  const displayName = () =>
    session().data?.user.name || session().data?.user.email?.split('@')[0] || 'User';
  const subtitle = () => session().data?.user.email || '已登录';

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) setThemeMenuOpen(false);
    props.onDropdownOpenChange(open);
  };

  onSettled(() => () => props.onDropdownOpenChange(false));

  return (
    <div class='border-t border-border px-6 py-5'>
      <div class='flex'>
        <div class='mx-auto relative w-full'>
          <DropdownMenu
            open={menuOpen()}
            onOpenChange={handleMenuOpenChange}
            positioning={{ placement: 'top-start', gutter: 4 }}
          >
            <DropdownMenuTrigger
              asChild={(triggerProps) => (
                <button
                  {...triggerProps}
                  type='button'
                  class='flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-hover hover:text-foreground'
                >
                  <span class='flex min-w-0 shrink-0 items-center gap-2 overflow-hidden text-left'>
                    <span class='truncate text-sm font-semibold text-foreground'>
                      {displayName()}
                    </span>
                  </span>
                </button>
              )}
            />
            <DropdownMenuContent class='min-w-55 p-1'>
              <div class='flex items-center gap-1.5 px-2 py-1.5'>
                <div class='min-w-0 flex-1'>
                  <div class='flex min-w-0 items-center gap-2.5'>
                    <span class='truncate text-sm font-medium text-foreground'>
                      {displayName()}
                    </span>
                  </div>
                  <div class='text-xs leading-tight text-muted-foreground'>{subtitle()}</div>
                </div>
              </div>

              <div class='-mx-1 my-1 h-px bg-border' />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setThemeMenuOpen(!themeMenuOpen());
                }}
              >
                <Palette class='h-4 w-4' />
                主题: {theme().label}
              </DropdownMenuItem>

              {themeMenuOpen() && (
                <For each={themes}>
                  {(item) => (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setTheme(item);
                      }}
                    >
                      {theme().id === item.id ? (
                        <Check class='h-3.5 w-3.5' />
                      ) : (
                        <span class='h-3.5 w-3.5' />
                      )}
                      <span class='text-xs'>{item.label}</span>
                    </DropdownMenuItem>
                  )}
                </For>
              )}

              <DropdownMenuItem
                onSelect={() => {
                  setSettingsOpen(true);
                }}
              >
                <Settings class='h-4 w-4' />
                设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {settingsOpen() ? (
            <SettingsModal open={settingsOpen()} onOpenChange={setSettingsOpen} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
