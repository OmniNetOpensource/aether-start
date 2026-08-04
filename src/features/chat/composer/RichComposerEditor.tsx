import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FileText, Image, Loader2, Quote, X } from 'lucide-react';
import {
  BASE64_MESSAGE_MAX_SIZE,
  convertImageToBase64,
  getBase64ImageValidationMessage,
} from '@/features/attachments/attachment-upload';
import { toast } from '@/shared/app-shell/useToast';
import { cn } from '@/shared/core/utils';
import { collectClipboardFiles } from '@/shared/browser/file';
import {
  isComposerDocumentEmpty,
  type ComposerDocument,
  type PendingAttachment,
} from './composer-document';

const CHIP_NODE = 'composerChip';

const createComposerItemId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

const readString = (value: unknown) => (typeof value === 'string' ? value : '');

const appendText = (document: ComposerDocument, text: string) => {
  if (!text) {
    return;
  }

  const last = document[document.length - 1];
  if (last?.type === 'text') {
    last.text += text;
    return;
  }

  document.push({ type: 'text', text });
};

const editorJSONFromComposerDocument = (document: ComposerDocument): JSONContent => {
  const paragraphs: JSONContent[] = [{ type: 'paragraph', content: [] }];

  for (const item of document) {
    const paragraph = paragraphs[paragraphs.length - 1];
    if (!paragraph.content) {
      paragraph.content = [];
    }

    if (item.type === 'quote') {
      paragraph.content.push({
        type: CHIP_NODE,
        attrs: {
          kind: 'quote',
          id: item.quote.id,
          text: item.quote.text,
        },
      });
      continue;
    }

    if (item.type === 'attachment') {
      paragraph.content.push({
        type: CHIP_NODE,
        attrs: {
          kind: 'attachment',
          id: item.attachment.id,
          name: item.attachment.name,
          size: item.attachment.size,
          mimeType: item.attachment.mimeType,
          url: item.attachment.url,
          storageKey: item.attachment.storageKey ?? '',
          localUrl: item.attachment.localUrl ?? '',
        },
      });
      continue;
    }

    const lines = item.text.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) {
        paragraphs.push({ type: 'paragraph', content: [] });
      }
      if (line) {
        paragraphs[paragraphs.length - 1].content?.push({ type: 'text', text: line });
      }
    });
  }

  return { type: 'doc', content: paragraphs };
};

const composerDocumentFromEditorJSON = (json: JSONContent): ComposerDocument => {
  const document: ComposerDocument = [];
  const paragraphs = json.content ?? [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) {
      appendText(document, '\n');
    }

    for (const node of paragraph.content ?? []) {
      if (node.type === 'text') {
        appendText(document, node.text ?? '');
        continue;
      }

      if (node.type === 'hardBreak') {
        appendText(document, '\n');
        continue;
      }

      if (node.type !== CHIP_NODE || !node.attrs) {
        continue;
      }

      if (node.attrs.kind === 'quote') {
        document.push({
          type: 'quote',
          quote: {
            id: readString(node.attrs.id),
            text: readString(node.attrs.text),
          },
        });
        continue;
      }

      const storageKey = readString(node.attrs.storageKey);
      const localUrl = readString(node.attrs.localUrl);
      const attachment: PendingAttachment = {
        id: readString(node.attrs.id),
        kind: 'image',
        name: readString(node.attrs.name),
        size: typeof node.attrs.size === 'number' ? node.attrs.size : 0,
        mimeType: readString(node.attrs.mimeType),
        url: readString(node.attrs.url),
        ...(storageKey ? { storageKey } : {}),
        ...(localUrl ? { localUrl } : {}),
      };
      document.push({ type: 'attachment', attachment });
    }
  });

  return document;
};

function ComposerChipView({ node, deleteNode }: NodeViewProps) {
  const isQuote = node.attrs.kind === 'quote';
  const localUrl = readString(node.attrs.localUrl);
  const url = localUrl || readString(node.attrs.url);

  return (
    <NodeViewWrapper
      as='span'
      contentEditable={false}
      className='group mx-1 inline-flex max-w-64 align-middle'
    >
      <span className='inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg border bg-background/80 py-1 pl-1.5 pr-1 text-xs shadow-sm'>
        {isQuote ? (
          <Quote className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        ) : url ? (
          <span className='relative h-6 w-6 shrink-0 overflow-hidden rounded'>
            <img src={url} alt='' className='h-full w-full object-cover' />
            {localUrl ? (
              <span className='absolute inset-0 grid place-items-center bg-black/40'>
                <Loader2 className='h-3.5 w-3.5 animate-spin text-white' />
              </span>
            ) : null}
          </span>
        ) : node.attrs.mimeType?.startsWith('image/') ? (
          <Image className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        ) : (
          <FileText className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        )}
        <span className='truncate'>
          {isQuote ? readString(node.attrs.text) : readString(node.attrs.name)}
        </span>
        <button
          type='button'
          aria-label={isQuote ? '删除引用' : '删除图片'}
          onClick={deleteNode}
          className='grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-hover hover:text-foreground'
        >
          <X className='h-3 w-3' />
        </button>
      </span>
    </NodeViewWrapper>
  );
}

const ComposerChip = Node.create({
  name: CHIP_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: { default: 'quote' },
      id: { default: '' },
      text: { default: '' },
      name: { default: '' },
      size: { default: 0 },
      mimeType: { default: '' },
      url: { default: '' },
      storageKey: { default: '' },
      localUrl: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-composer-chip]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-composer-chip': '' })];
  },
  renderText({ node }) {
    return node.attrs.kind === 'quote'
      ? `[引用：${readString(node.attrs.text)}]`
      : `[图片：${readString(node.attrs.name)}]`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ComposerChipView);
  },
});

const extensions = [
  StarterKit.configure({
    blockquote: false,
    bold: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    listKeymap: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    underline: false,
  }),
  ComposerChip,
];

export type RichComposerEditorHandle = {
  focus: () => void;
  clear: () => void;
  insertQuote: (text: string) => void;
  insertFiles: (files: File[]) => Promise<void>;
};

type RichComposerEditorProps = {
  id: string;
  document: ComposerDocument;
  onChange: (document: ComposerDocument) => void;
  onFocus?: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder: string;
  className?: string;
};

export const RichComposerEditor = forwardRef<RichComposerEditorHandle, RichComposerEditorProps>(
  function RichComposerEditor(
    {
      id,
      document,
      onChange,
      onFocus,
      onSubmit,
      disabled = false,
      autoFocus = false,
      placeholder,
      className,
    },
    ref,
  ) {
    const onChangeRef = useRef(onChange);
    const onSubmitRef = useRef(onSubmit);
    onChangeRef.current = onChange;
    onSubmitRef.current = onSubmit;

    const editor = useEditor({
      extensions,
      content: editorJSONFromComposerDocument(document),
      editable: !disabled,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          id,
          role: 'textbox',
          'aria-label': placeholder,
          class: cn(
            'min-h-12 max-h-50 overflow-y-auto whitespace-pre-wrap break-words px-2 py-3 text-sm leading-relaxed outline-none sm:text-base',
            className,
          ),
        },
        handleKeyDown: (_, event) => {
          if (event.key !== 'Enter' || !event.ctrlKey || event.shiftKey) {
            return false;
          }

          event.preventDefault();
          onSubmitRef.current();
          return true;
        },
        handlePaste: (_, event) => {
          if (!event.clipboardData) {
            return false;
          }

          const files = collectClipboardFiles(event.clipboardData);
          if (files.length === 0) {
            return false;
          }

          event.preventDefault();
          void insertFiles(files);
          return true;
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        onChangeRef.current(composerDocumentFromEditorJSON(updatedEditor.getJSON()));
      },
    });

    const updateAttachment = (id: string, attachment: PendingAttachment) => {
      if (!editor || editor.isDestroyed) {
        return;
      }

      editor
        .chain()
        .command(({ state, tr }) => {
          let found = false;
          state.doc.descendants((node, position) => {
            if (node.type.name !== CHIP_NODE || node.attrs.id !== id) {
              return true;
            }

            tr.setNodeMarkup(position, undefined, {
              kind: 'attachment',
              id: attachment.id,
              name: attachment.name,
              size: attachment.size,
              mimeType: attachment.mimeType,
              url: attachment.url,
              storageKey: attachment.storageKey ?? '',
              localUrl: attachment.localUrl ?? '',
            });
            found = true;
            return false;
          });
          return found;
        })
        .run();
    };

    const removeAttachment = (id: string) => {
      if (!editor || editor.isDestroyed) {
        return;
      }

      editor
        .chain()
        .command(({ state, tr }) => {
          let found = false;
          state.doc.descendants((node, position) => {
            if (node.type.name !== CHIP_NODE || node.attrs.id !== id) {
              return true;
            }

            tr.delete(position, position + node.nodeSize);
            found = true;
            return false;
          });
          return found;
        })
        .run();
    };

    const insertQuote = (text: string) => {
      const trimmed = text.trim();
      if (!editor || !trimmed) {
        return;
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: CHIP_NODE,
          attrs: {
            kind: 'quote',
            id: createComposerItemId(),
            text: trimmed,
          },
        })
        .run();
    };

    async function insertFiles(files: File[]) {
      if (!editor || disabled || files.length === 0) {
        return;
      }

      const queued: { file: File; attachment: PendingAttachment }[] = [];
      let totalSize = document.reduce(
        (sum, item) => sum + (item.type === 'attachment' ? item.attachment.size : 0),
        0,
      );
      for (const file of files) {
        const validationMessage = getBase64ImageValidationMessage(file);
        if (validationMessage) {
          toast.warning(validationMessage);
          continue;
        }

        if (totalSize + file.size > BASE64_MESSAGE_MAX_SIZE) {
          toast.warning('每条消息的图片总大小不能超过 8MB。');
          continue;
        }

        queued.push({
          file,
          attachment: {
            id: createComposerItemId(),
            kind: 'image',
            name: file.name,
            size: file.size,
            mimeType: file.type,
            url: '',
            localUrl: URL.createObjectURL(file),
          },
        });
        totalSize += file.size;
      }

      if (queued.length === 0) {
        return;
      }

      editor
        .chain()
        .focus()
        .insertContent(
          queued.map(({ attachment }) => ({
            type: CHIP_NODE,
            attrs: {
              kind: 'attachment',
              id: attachment.id,
              name: attachment.name,
              size: attachment.size,
              mimeType: attachment.mimeType,
              url: '',
              storageKey: '',
              localUrl: attachment.localUrl ?? '',
            },
          })),
        )
        .run();

      await Promise.all(
        queued.map(async ({ file, attachment }) => {
          try {
            updateAttachment(attachment.id, await convertImageToBase64(file, attachment.id));
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`Failed to upload image "${file.name}"`, error);
            toast.error(`上传图片「${file.name}」失败：${detail}`);
            removeAttachment(attachment.id);
          } finally {
            if (attachment.localUrl) {
              URL.revokeObjectURL(attachment.localUrl);
            }
          }
        }),
      );
    }

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      clear: () => {
        editor?.commands.setContent(editorJSONFromComposerDocument([]), { emitUpdate: false });
      },
      insertQuote,
      insertFiles,
    }));

    useEffect(() => {
      if (!editor) {
        return;
      }

      if (editor.isEditable !== !disabled) {
        editor.setEditable(!disabled);
      }
      if (
        JSON.stringify(composerDocumentFromEditorJSON(editor.getJSON())) !==
        JSON.stringify(document)
      ) {
        editor.commands.setContent(editorJSONFromComposerDocument(document), { emitUpdate: false });
      }
    }, [disabled, document, editor]);

    useEffect(() => {
      if (autoFocus) {
        editor?.commands.focus('end');
      }
    }, [autoFocus, editor]);

    return (
      <div className='relative min-w-0 flex-1' onFocusCapture={onFocus}>
        {isComposerDocumentEmpty(document) ? (
          <span className='pointer-events-none absolute left-2 top-3 text-sm text-muted-foreground sm:text-base'>
            {placeholder}
          </span>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    );
  },
);
