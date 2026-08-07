import { Link, createFileRoute } from '@tanstack/solid-router';
import { createMemo, Loading } from 'solid-js';
import { Loader2 } from '@/frontend/design-system/icons';
import { ReadonlyMessageList } from '@/frontend/share/public-thread';
import { truncateMiddle } from '@/shared/core/truncate-middle';
import { getPublicConversationShareFn } from '@/rpc/share';
import type { Message } from '@/shared/chat/message';

type PublicShareData = Awaited<ReturnType<typeof getPublicConversationShareFn>>;
type ActivePublicShare = Extract<PublicShareData, { status: 'active' }>;
type SharedPageMessage = ActivePublicShare['snapshot']['messages'][number];

const toReadonlyMessage = (message: SharedPageMessage): Message => {
  if (message.role === 'user') {
    const blocks: Extract<Message, { role: 'user' }>['blocks'] = [];
    for (const block of message.blocks) {
      if (block.type === 'content' || block.type === 'quotes' || block.type === 'attachments')
        blocks.push(block);
    }
    return {
      id: message.id,
      role: 'user',
      blocks,
      createdAt: message.createdAt,
      completedAt: null,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
    };
  }
  const blocks: Extract<Message, { role: 'assistant' }>['blocks'] = [];
  for (const block of message.blocks) {
    if (block.type === 'content' || block.type === 'research' || block.type === 'error')
      blocks.push(block);
  }
  return {
    id: message.id,
    role: 'assistant',
    blocks,
    createdAt: message.createdAt,
    completedAt:
      'completedAt' in message && typeof message.completedAt === 'string'
        ? message.completedAt
        : null,
    parentId: null,
    prevSibling: null,
    nextSibling: null,
    latestChild: null,
  };
};

export const Route = createFileRoute('/share/$token')({
  head: () => ({
    meta: [
      {
        name: 'robots',
        content: 'noindex,nofollow',
      },
      {
        title: 'Aether 分享',
      },
    ],
  }),
  component: SharedConversationPage,
});

function SharedConversationPage() {
  const params = Route.useParams();
  const data = createMemo(
    (): Promise<PublicShareData> =>
      getPublicConversationShareFn({ data: { token: params().token } }),
  );
  const readonlyMessages = () => {
    const share = data();
    return share.status === 'active' ? share.snapshot.messages.map(toReadonlyMessage) : [];
  };

  const loadingPage = (
    <main class='flex min-h-screen w-full items-center justify-center bg-background px-6'>
      <div class='flex items-center gap-2 text-secondary'>
        <Loader2 class='h-4 w-4 animate-spin' />
        加载分享中...
      </div>
    </main>
  );

  const page = () => {
    const share = data();

    if (share.status === 'not_found')
      return (
        <main class='flex min-h-screen w-full items-center justify-center bg-background px-6'>
          <div class='w-full max-w-md rounded-xl border border-border bg-background p-8 text-center'>
            <h1 class='text-2xl font-semibold text-foreground'>分享不存在</h1>
            <p class='mt-3 text-sm text-secondary'>该链接无效，或已被删除。</p>
            <Link
              to='/'
              class='mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-background hover:opacity-90'
            >
              返回首页
            </Link>
          </div>
        </main>
      );

    if (share.status === 'revoked')
      return (
        <main class='flex min-h-screen w-full items-center justify-center bg-background px-6'>
          <div class='w-full max-w-md rounded-xl border border-border bg-background p-8 text-center'>
            <h1 class='text-2xl font-semibold text-foreground'>该分享已取消</h1>
            <p class='mt-3 text-sm text-secondary'>分享者已关闭此链接访问。</p>
            <Link
              to='/'
              class='mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-background hover:opacity-90'
            >
              返回首页
            </Link>
          </div>
        </main>
      );

    const headingText = share.title?.trim() || 'Aether 分享';

    return (
      <main class='h-screen w-full bg-background overflow-y-auto'>
        <div class='pt-12 flex flex-col items-center'>
          <div class='w-full max-w-[390px] px-4 mb-8'>
            <h1 class='text-2xl font-semibold text-foreground' title={headingText}>
              {truncateMiddle(headingText, 36)}
            </h1>
          </div>
          <div class='w-full max-w-[390px] pb-12'>
            <ReadonlyMessageList messages={readonlyMessages()} isPhone />
          </div>
        </div>
      </main>
    );
  };
  return <Loading fallback={loadingPage}>{page()}</Loading>;
}
