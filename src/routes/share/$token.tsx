import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
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
  const { token } = Route.useParams();
  const shareQuery = useQuery({
    queryKey: ['public-conversation-share', token],
    queryFn: () => getPublicConversationShareFn({ data: { token } }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
    gcTime: 0,
  });

  if (shareQuery.status === 'pending') {
    return (
      <main className='flex min-h-screen w-full items-center justify-center bg-background px-6'>
        <div className='flex items-center gap-2 text-secondary'>
          <Loader2 className='h-4 w-4 animate-spin' />
          加载分享中...
        </div>
      </main>
    );
  }
  if (shareQuery.status === 'error') throw shareQuery.error;
  const share = shareQuery.data;

  if (share.status === 'not_found') {
    return (
      <main className='flex min-h-screen w-full items-center justify-center bg-background px-6'>
        <div className='w-full max-w-md rounded-xl border border-border bg-background p-8 text-center'>
          <h1 className='text-2xl font-semibold text-foreground'>分享不存在</h1>
          <p className='mt-3 text-sm text-secondary'>该链接无效，或已被删除。</p>
          <Link
            to='/'
            className='mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-background hover:opacity-90'
          >
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  if (share.status === 'revoked') {
    return (
      <main className='flex min-h-screen w-full items-center justify-center bg-background px-6'>
        <div className='w-full max-w-md rounded-xl border border-border bg-background p-8 text-center'>
          <h1 className='text-2xl font-semibold text-foreground'>该分享已取消</h1>
          <p className='mt-3 text-sm text-secondary'>分享者已关闭此链接访问。</p>
          <Link
            to='/'
            className='mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-background hover:opacity-90'
          >
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  const headingText = share.title?.trim() || 'Aether 分享';
  const readonlyMessages = share.snapshot.messages.map(toReadonlyMessage);

  return (
    <main className='h-screen w-full bg-background overflow-y-auto'>
      <div className='pt-12 flex flex-col items-center'>
        <div className='w-full max-w-[390px] px-4 mb-8'>
          <h1 className='text-2xl font-semibold text-foreground' title={headingText}>
            {truncateMiddle(headingText, 36)}
          </h1>
        </div>
        <div className='w-full max-w-[390px] pb-12'>
          <ReadonlyMessageList messages={readonlyMessages} isPhone />
        </div>
      </div>
    </main>
  );
}
