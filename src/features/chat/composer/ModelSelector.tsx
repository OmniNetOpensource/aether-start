'use client';

import * as React from 'react';
import { Bot, Check, ChevronDown } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useResponsive } from '@/components/ResponsiveContext';
import { useAppShellRouteData } from '@/features/sidebar/app-shell-route-data';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';

export function ModelSelector() {
  const appShellData = useAppShellRouteData();
  const [open, setOpen] = React.useState(false);
  const isMobile = useResponsive() === 'mobile';
  const currentRole = useChatSessionStore((state) => state.currentRole);
  const setCurrentRole = useChatSessionStore((state) => state.setCurrentRole);
  const initialRoles = appShellData?.availableRoles ?? [];
  const initialRoleId = appShellData?.initialRoleId ?? '';

  const selectedRoleId = currentRole || initialRoleId || (initialRoles[0]?.id ?? '');
  const currentRoleName = initialRoles.find((role) => role.id === selectedRoleId)?.name ?? '';

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground';

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => setOpen(true)}
        aria-label={currentRoleName ? `选择模型，当前为 ${currentRoleName}` : '选择模型'}
        title={currentRoleName || '选择模型'}
        data-testid='model-selector'
        className={cn(
          toolButtonBaseClass,
          'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground',
        )}
      >
        <span className='flex @[921px]:hidden'>
          <Bot className='h-3.5 w-3.5' />
        </span>
        <span className='hidden @[921px]:flex items-center gap-1.5'>
          <span className='max-w-40 truncate'>{currentRoleName}</span>
          <ChevronDown className='h-3 w-3 transition-transform duration-300' />
        </span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} label='选择模型'>
        <Command className='rounded-lg border-0' loop>
          <CommandInput placeholder='搜索模型...' autoFocus={!isMobile} />
          <CommandList>
            <CommandEmpty>未找到匹配的模型</CommandEmpty>
            {initialRoles.map((role) => (
              <CommandItem
                key={role.id}
                value={`${role.id} ${role.name}`}
                onSelect={() => {
                  setCurrentRole(role.id);
                  setOpen(false);
                }}
              >
                <span className='flex-1 truncate'>{role.name}</span>
                {selectedRoleId === role.id && <Check className='h-4 w-4 shrink-0' />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
