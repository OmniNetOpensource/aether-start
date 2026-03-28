/**
 * 选区工具�?- 主组�? *
 * 在用户于 assistant 消息内选中文本时，显示浮动工具栏，提供�? * - 引用：将选中文本插入到输入框光标�? * - 朗读：调�?TTS 播放选中文本
 *
 * 依赖 useSelectionToolbar 做选区检测与定位，useTtsPlayback 做朗读逻辑�? * 使用 CSS transitions 替代 Framer Motion，实现硬件加�?(Emil Design Engineering)�? */

import { useEffect, useState, type RefObject } from 'react';
import { Quote, Volume2, Loader2, Square } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { useComposerStore } from '@/features/chat/composer/useComposerStore';
import { useSelectionToolbar } from './useSelectionToolbar';
import { useTtsPlayback } from './useTtsPlayback';

type SelectionToolbarProps = {
  /** 消息列表滚动容器�?ref，用于限定选区检测范�?*/
  containerRef: RefObject<HTMLElement | null>;
};

export function SelectionToolbar({ containerRef }: SelectionToolbarProps) {
  const { text, hasSelection, clearSelection, floatingRef, floatingStyles } =
    useSelectionToolbar(containerRef);
  const { ttsState, handleTts } = useTtsPlayback(text);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (hasSelection && !mounted) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
  }, [hasSelection, mounted]);

  /** 根据 TTS 状态显示不同图标：加载中旋转、播放中方块、默认喇�?*/
  const ttsIcon =
    ttsState === 'loading' ? (
      <Loader2 className='h-4 w-4 animate-spin' />
    ) : ttsState === 'playing' ? (
      <Square className='h-3 w-3' />
    ) : (
      <Volume2 className='h-4 w-4' />
    );

  const handleQuote = () => {
    if (text) {
      useComposerStore.getState().addQuote(text);
      clearSelection();
    }
  };

  if (!hasSelection) return null;

  return (
    <div
      ref={floatingRef}
      style={floatingStyles}
      data-mounted={mounted}
      className='flex gap-1 rounded-lg bg-background p-1 shadow-lg backdrop-blur-md border border-border transition-[opacity,transform] duration-150 ease-[var(--ease-out)] data-[mounted=false]:opacity-0 data-[mounted=false]:translate-y-1 data-[mounted=false]:scale-[0.95]'
      data-selection-toolbar
    >
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handleQuote}
        className='h-8 gap-1.5 rounded-md px-2.5 text-xs hover:bg-(--surface-hover)'
      >
        <Quote className='h-3.5 w-3.5' />
        引用
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handleTts}
        disabled={ttsState === 'loading'}
        className='h-8 gap-1.5 rounded-md px-2.5 text-xs hover:bg-(--surface-hover)'
      >
        {ttsIcon}
        {ttsState === 'playing' ? '停止' : '朗读'}
      </Button>
    </div>
  );
}
