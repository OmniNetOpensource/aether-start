import { useEffect } from 'react';

/**
 * 设置并维护 --vh CSS 变量（1% 视口高度），用于替代 100vh。
 * 解决移动端地址栏显隐导致的视口高度变化问题。
 */
export function useViewportHeight() {
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };

    setVh();
    window.addEventListener('resize', setVh);
    return () => window.removeEventListener('resize', setVh);
  }, []);
}
