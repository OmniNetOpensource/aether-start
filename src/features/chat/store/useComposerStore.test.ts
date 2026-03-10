import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/types/message'

const {
  createPendingAttachmentUploadMock,
  revokePendingAttachmentUploadMock,
  uploadAttachmentFileMock,
} = vi.hoisted(() => ({
  createPendingAttachmentUploadMock: vi.fn(),
  revokePendingAttachmentUploadMock: vi.fn(),
  uploadAttachmentFileMock: vi.fn(),
}))

vi.mock('@/lib/chat/attachments', () => ({
  createPendingAttachmentUpload: createPendingAttachmentUploadMock,
  revokePendingAttachmentUpload: revokePendingAttachmentUploadMock,
  uploadAttachmentFile: uploadAttachmentFileMock,
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

const pendingUpload = (id: string) => ({
  id,
  kind: 'image' as const,
  name: `${id}.png`,
  size: 123,
  mimeType: 'image/png',
  previewUrl: `blob:${id}`,
})

describe('useComposerStore', () => {
  beforeEach(() => {
    createPendingAttachmentUploadMock.mockReset()
    revokePendingAttachmentUploadMock.mockReset()
    uploadAttachmentFileMock.mockReset()
    useComposerStore.setState({
      input: '',
      pendingAttachments: [],
      uploadingAttachments: [],
      uploading: false,
      _uploadGeneration: 0,
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

    useComposerStore.setState({
      uploadingAttachments: [pendingUpload('draft')],
      uploading: true,
    })

    useComposerStore.getState().clearAttachments()
    expect(useComposerStore.getState()).toMatchObject({
      pendingAttachments: [],
      uploadingAttachments: [],
      uploading: false,
    })
    expect(revokePendingAttachmentUploadMock).toHaveBeenCalledWith(pendingUpload('draft'))
  })

  it('clears all composer state', () => {
    useComposerStore.setState({
      input: 'draft',
      pendingAttachments: [attachment('a1')],
      uploadingAttachments: [pendingUpload('draft')],
      uploading: true,
    })

    useComposerStore.getState().clear()

    expect(useComposerStore.getState()).toMatchObject({
      input: '',
      pendingAttachments: [],
      uploadingAttachments: [],
      uploading: false,
    })
    expect(revokePendingAttachmentUploadMock).toHaveBeenCalledWith(pendingUpload('draft'))
  })

  it('adds attachments from async uploader and clears drafts', async () => {
    const files = [new File(['x'], 'x.png', { type: 'image/png' })]
    createPendingAttachmentUploadMock.mockReturnValueOnce(pendingUpload('draft-1'))
    uploadAttachmentFileMock.mockResolvedValueOnce(attachment('new'))
    useComposerStore.setState({ pendingAttachments: [attachment('existing')] })

    await useComposerStore.getState().addAttachments(files)

    expect(createPendingAttachmentUploadMock).toHaveBeenCalledTimes(1)
    expect(createPendingAttachmentUploadMock.mock.calls[0]?.[0]).toBe(files[0])
    expect(uploadAttachmentFileMock).toHaveBeenCalledWith(files[0])
    expect(useComposerStore.getState()).toMatchObject({
      uploading: false,
      uploadingAttachments: [],
      pendingAttachments: [attachment('existing'), attachment('new')],
    })
    expect(revokePendingAttachmentUploadMock).toHaveBeenCalledWith(pendingUpload('draft-1'))
  })
})
