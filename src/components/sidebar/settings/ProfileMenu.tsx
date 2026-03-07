import { useEffect, useState } from 'react'
import { Moon, Settings, Sun, User2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/useTheme'
import { authClient } from '@/lib/auth/auth-client'
import { useSidebarOverlay } from '../SidebarOverlayContext'
import { SettingsModal } from './SettingsModal'

type ProfileMenuProps = {
  isCollapsed?: boolean
}

export function ProfileMenu({ isCollapsed = false }: ProfileMenuProps) {
  const overlayId = 'profile-menu'
  const { data: session } = authClient.useSession()
  const { theme, toggleTheme } = useTheme()
  const { setOverlayOpen } = useSidebarOverlay()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const displayName =
    session?.user.name || session?.user.email?.split('@')[0] || 'User'
  const subtitle = session?.user.email || ''

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open)
    setOverlayOpen(overlayId, open)
  }

  useEffect(() => {
    return () => {
      setOverlayOpen(overlayId, false)
    }
  }, [overlayId, setOverlayOpen])

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
                  className={`flex min-w-0 shrink-0 items-center transition-all duration-500 ${
                    isCollapsed ? 'gap-0' : 'gap-2'
                  }`}
                >
                  <Avatar className='h-8 w-8'>
                    <AvatarFallback className='text-sm font-semibold'>
                      <User2 className='h-4 w-4' />
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className='flex min-w-0 flex-col overflow-hidden text-left transition-all duration-500'
                    style={{
                      width: isCollapsed ? 0 : 'auto',
                      opacity: isCollapsed ? 0 : 1,
                    }}
                  >
                    <span className='truncate text-sm font-semibold text-foreground'>
                      {displayName}
                    </span>
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side='top' align='start' className='min-w-55 p-1'>
              <div className='flex items-center gap-1.5 px-2 py-1.5'>
                <Avatar className='h-5 w-5'>
                  <AvatarFallback className='text-xs font-semibold'>
                    <User2 className='h-3 w-3' />
                  </AvatarFallback>
                </Avatar>
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
                {theme === 'dark' ? (
                  <Sun className='h-4 w-4' />
                ) : (
                  <Moon className='h-4 w-4' />
                )}
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
  )
}
