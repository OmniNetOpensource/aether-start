import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { Quote } from './icons';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('icons', () => {
  it('renders every SVG child with a stable React key', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderTest(() => <Quote />);

    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
      'Each child in a list should have a unique "key" prop',
    );
  });
});
