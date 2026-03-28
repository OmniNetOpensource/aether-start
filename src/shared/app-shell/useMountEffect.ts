import { useEffect } from 'react';

/** 挂载后执行一次；可返回清理函数，与 `useEffect(fn, [])` 等价。 */
export function useMountEffect(effect: () => void | (() => void)) {
  // oxlint-disable-next-line eslint-plugin-react-hooks(exhaustive-deps) -- intentional mount-only
  useEffect(() => effect(), []);
}
