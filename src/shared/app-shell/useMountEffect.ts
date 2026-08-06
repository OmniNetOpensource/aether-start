import { onSettled } from 'solid-js';

/** 首次渲染稳定后执行一次，也负责注册清理函数。 */
export function useMountEffect(effect: () => void | (() => void)) {
  onSettled(effect);
}
