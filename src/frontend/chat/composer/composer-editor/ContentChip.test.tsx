import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderTest } from '@/test/render';
import { ContentChip } from './ContentChip';

describe('ContentChip', () => {
  it('keeps an image chip at text-chip height', () => {
    renderTest(() => (
      <ContentChip
        kind='attachment'
        name='photo.png'
        size={1024}
        mimeType='image/png'
        url='https://example.com/photo.png'
      />
    ));

    const image = screen.getByRole('button', { name: '预览图片 photo.png' });
    expect(image.classList.contains('!h-7')).toBe(true);
    expect(image.classList.contains('!w-7')).toBe(true);
  });

  it('lets a quote chip shrink to its container', () => {
    renderTest(() => <ContentChip kind='quote' text='A long quote' />);

    expect(screen.getByText('A long quote').parentElement?.classList.contains('max-w-full')).toBe(
      true,
    );
  });
});
