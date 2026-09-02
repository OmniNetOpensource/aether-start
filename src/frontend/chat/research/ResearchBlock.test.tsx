import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderTest } from '@/test/render';
import type { ResearchItem } from '@/shared/chat/message';
import { ResearchBlock } from './ResearchBlock';

const searchItems = (
  platform?: 'google' | 'weixin' | 'rednote',
  result?: string,
): ResearchItem[] => [
  {
    kind: 'tool',
    data: {
      call: {
        tool: 'search',
        args: platform ? { query: '人工智能', platform } : { query: '人工智能' },
        callId: 'search-1',
      },
      ...(result ? { result: { result } } : {}),
    },
  },
];

describe('ResearchBlock', () => {
  it('shows the selected search platform and treats an omitted platform as Google', () => {
    const view = renderTest(() => <ResearchBlock items={searchItems()} />);
    expect(screen.getByText('搜索 Google · 人工智能')).toBeTruthy();

    view.rerender(() => <ResearchBlock items={searchItems('google')} />);
    expect(screen.getByText('搜索 Google · 人工智能')).toBeTruthy();

    view.rerender(() => <ResearchBlock items={searchItems('weixin')} />);
    expect(screen.getByText('搜索微信公众号 · 人工智能')).toBeTruthy();

    view.rerender(() => <ResearchBlock items={searchItems('rednote')} />);
    expect(screen.getByText('搜索小红书 · 人工智能')).toBeTruthy();
  });

  it('keeps the platform visible with restored search results', () => {
    renderTest(() => (
      <ResearchBlock
        items={searchItems(
          'rednote',
          JSON.stringify({
            results: [
              {
                title: '测试笔记',
                url: 'https://www.xiaohongshu.com/explore/test-note',
              },
            ],
          }),
        )}
      />
    ));

    expect(screen.getByText('搜索小红书 · 人工智能')).toBeTruthy();
    expect(screen.getByRole('link', { name: /测试笔记/ }).getAttribute('href')).toBe(
      'https://www.xiaohongshu.com/explore/test-note',
    );
  });

  it('does not label legacy search tools as Google', () => {
    renderTest(() => (
      <ResearchBlock
        items={[
          {
            kind: 'tool',
            data: {
              call: {
                tool: 'tavily_search',
                args: { query: '人工智能' },
                callId: 'legacy-search-1',
              },
            },
          },
        ]}
      />
    ));

    expect(screen.getByText('Reading the web · 人工智能')).toBeTruthy();
    expect(screen.queryByText('搜索 Google · 人工智能')).toBeNull();
  });
});
