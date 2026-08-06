import { createSignal } from 'solid-js';
import { render } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { afterEach } from 'vitest';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

export function renderTest(
  factory: () => JSX.Element,
  wrapper?: (children: () => JSX.Element) => JSX.Element,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let currentFactory = factory;
  const [version, setVersion] = createSignal(0);
  const mount = () =>
    render(() => {
      version();
      return wrapper ? wrapper(() => currentFactory()) : currentFactory();
    }, container);
  let dispose = mount();
  cleanups.push(() => dispose());
  return {
    container,
    rerender(nextFactory: () => JSX.Element) {
      dispose();
      container.replaceChildren();
      currentFactory = nextFactory;
      setVersion((current) => current + 1);
      dispose = mount();
    },
  };
}

export async function act(action: () => void | Promise<void>) {
  await action();
  await Promise.resolve();
}
