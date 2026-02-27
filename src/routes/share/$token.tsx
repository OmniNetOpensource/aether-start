import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SharedConversationView, type ShareRenderableMessage } from '@/components/chat/share/SharedConversationView'
import { getPublicConversationShareFn } from '@/server/functions/shares'

type PublicShareData = Awaited<ReturnType<typeof getPublicConversationShareFn>>

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
})

function SharedConversationPage() {
  const { token } = Route.useParams()
  const [data, setData] = useState<PublicShareData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const result = await getPublicConversationShareFn({
          data: { token },
        })
        if (!cancelled) {
          setData(result as PublicShareData)
        }
      } catch (error) {
        console.error('Failed to load public share', error)
        if (!cancelled) {
          setData({ status: 'not_found' } as PublicShareData)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [token])

  if (loading || !data) {
    return (
      <main className='flex min-h-screen w-full items-center justify-center bg-(--surface-primary) px-6'>
        <div className='flex items-center gap-2 text-(--text-secondary)'>
          <Loader2 className='h-4 w-4 animate-spin' />
          加载分享中...
        </div>
      </main>
    )
  }

  if (data.status === 'not_found') {
    return (
      <main className='flex min-h-screen w-full items-center justify-center bg-(--surface-primary) px-6'>
        <div className='w-full max-w-md rounded-xl border border-border bg-background p-8 text-center'>
          <h1 className='text-2xl font-semibold text-(--text-primary)'>分享不存在</h1>
          <p className='mt-3 text-sm text-(--text-secondary)'>该链接无效，或已被删除。</p>
          <Link
            to='/'
            className='mt-6 inline-flex items-center rounded-lg bg-(--interactive-primary) px-4 py-2 text-sm text-(--surface-primary) hover:opacity-90'
          >
            返回首页
          </Link>
        </div>
      </main>
    )
  }

  if (data.status === 'revoked') {
    return (
      <main className='flex min-h-screen w-full items-center justify-center bg-(--surface-primary) px-6'>
        <div className='w-full max-w-md rounded-xl border border-border bg-background p-8 text-center'>
          <h1 className='text-2xl font-semibold text-(--text-primary)'>该分享已取消</h1>
          <p className='mt-3 text-sm text-(--text-secondary)'>分享者已关闭此链接访问。</p>
          <Link
            to='/'
            className='mt-6 inline-flex items-center rounded-lg bg-(--interactive-primary) px-4 py-2 text-sm text-(--surface-primary) hover:opacity-90'
          >
            返回首页
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen w-full bg-(--surface-primary) pb-12'>
      <div className='mx-auto w-[92%] max-w-4xl pt-12'>
        <header className='mb-8 rounded-2xl border border-border bg-background px-6 py-5'>
          <h1 className='text-2xl font-semibold text-(--text-primary)'>
            {data.title?.trim() || 'Aether 分享'}
          </h1>
          <p className='mt-2 text-sm text-(--text-secondary)'>该页面为只读分享内容</p>
        </header>

        <div className='rounded-2xl border border-border bg-background p-6'>
          <SharedConversationView
            messages={data.snapshot.messages as ShareRenderableMessage[]}
          />
        </div>
      </div>
    </main>
  )
}
