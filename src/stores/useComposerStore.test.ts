import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/types/message'

const { buildAttachmentsFromFilesMock } = vi.hoisted(() => ({
  buildAttachmentsFromFilesMock: vi.fn(),
}))

vi.mock('@/lib/chat/attachments', () => ({
  buildAttachmentsFromFiles: buildAttachmentsFromFilesMock,
}))

import { useComposerStore } from './useComposerStore'

const attachment = (id: string): Attachment => ({
  id,
  kind: 'image',
  name: `${id}.png`,
  size: 123,
  mimeType: 'image/png',
  url: `https://example.com/${id}.png`,
})

describe('useComposerStore', () => {
  beforeEach(() => {
    buildAttachmentsFromFilesMock.mockReset()
    useComposerStore.setState({
      input: '',
      pendingAttachments: [],
      uploading: false,
    })
  })

  it('sets and clears input', () => {
    useComposerStore.getState().setInput('hello')
    expect(useComposerStore.getState().input).toBe('hello')

    useComposerStore.getState().clearInput()
    expect(useComposerStore.getState().input).toBe('')
  })

  it('removes one attachment and clears all attachments', () => {
    useComposerStore.setState({
      pendingAttachments: [attachment('a1'), attachment('a2')],
    })

    useComposerStore.getState().removeAttachment('a1')
    expect(useComposerStore.getState().pendingAttachments.map((item) => item.id)).toEqual([
      'a2',
    ])

    useComposerStore.getState().clearAttachments()
    expect(useComposerStore.getState().pendingAttachments).toEqual([])
  })

  it('clears all composer state', () => {
    useComposerStore.setState({
      input: 'draft',
      pendingAttachments: [attachment('a1')],
      uploading: true,
    })

    useComposerStore.getState().clear()

    expect(useComposerStore.getState()).toMatchObject({
      input: '',
      pendingAttachments: [],
      uploading: false,
    })
  })

  it('adds attachments from async builder', async () => {
    const files = [new File(['x'], 'x.png', { type: 'image/png' })]
    buildAttachmentsFromFilesMock.mockResolvedValueOnce([attachment('new')])
    useComposerStore.setState({ pendingAttachments: [attachment('existing')] })

    await useComposerStore.getState().addAttachments(files)

    expect(buildAttachmentsFromFilesMock).toHaveBeenCalledWith(files)
    expect(useComposerStore.getState()).toMatchObject({
      uploading: false,
      pendingAttachments: [attachment('existing'), attachment('new')],
    })
  })
})
