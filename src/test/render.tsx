import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

export function renderTest(factory: () => ReactNode, wrapper?: (children: ReactNode) => ReactNode) {
  const result = render(wrapper ? wrapper(factory()) : factory());

  return {
    ...result,
    rerender(nextFactory: () => ReactNode) {
      result.rerender(wrapper ? wrapper(nextFactory()) : nextFactory());
    },
  };
}
