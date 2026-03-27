/**
 * 选区工具栏 - TTS 朗读 Hook
 *
 * 负责：
 * 1. 调用 ttsSynthesizeFn 将文本转为音频（hex 格式）
 * 2. 解码 hex 为 Uint8Array，创建 Blob 和 Object URL
 * 3. 使用 Audio 元素播放，监听 ended/error 做清理
 * 4. 管理 idle | loading | playing 三态，支持播放中点击停止
 */

import { useState, useRef } from 'react';
import { ttsSynthesizeFn } from '@/features/chat/server/functions/tts';
import { toast } from '@/shared/useToast';

export type TtsState = 'idle' | 'loading' | 'playing';

export function useTtsPlayback(text: string) {
  const [ttsState, setTtsState] = useState<TtsState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  /** 停止播放并释放 Audio 与 Object URL，避免内存泄漏 */
  const cleanup = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  /** 朗读/停止：playing 时停止，否则发起 TTS 请求并播放 */
  const handleTts = async () => {
    if (ttsState === 'playing') {
      cleanup();
      setTtsState('idle');
      return;
    }

    if (ttsState === 'loading') return;

    setTtsState('loading');
    try {
      const result = await ttsSynthesizeFn({ data: { text } });

      // 服务端返回 hex 字符串，每 2 字符对应 1 字节
      const hexStr = result.audio;
      const bytes = new Uint8Array(hexStr.length / 2);
      for (let i = 0; i < hexStr.length; i += 2) {
        bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
      }

      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('ended', () => {
        cleanup();
        setTtsState('idle');
      });

      audio.addEventListener('error', () => {
        cleanup();
        setTtsState('idle');
        toast.error('音频播放失败');
      });

      await audio.play();
      setTtsState('playing');
    } catch (error) {
      cleanup();
      setTtsState('idle');
      const message = error instanceof Error ? error.message : '语音合成失败';
      toast.error(message);
    }
  };

  return { ttsState, handleTts };
}
