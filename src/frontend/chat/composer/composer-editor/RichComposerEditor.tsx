import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Editor,
  Node,
  mergeAttributes,
  type JSONContent,
  type NodeViewRendererProps,
} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  BASE64_MESSAGE_MAX_SIZE,
  convertImageToBase64,
  getBase64ImageValidationMessage,
} from '@/frontend/attachments/attachment-upload';
import { useToast } from '@/frontend/app-shell/useToast';
import { cn } from '@/shared/core/utils';
import { collectClipboardFiles } from '@/frontend/browser/file';
import { type ComposerDocument, type PendingAttachment } from './composer-document';
import { ContentChip } from './ContentChip';

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

function createComposerChipView(props: NodeViewRendererProps) {
  let currentNode = props.node;
  const dom = document.createElement('span');
  dom.contentEditable = 'false';
  dom.className = 'group mx-1 inline-flex max-w-64 align-middle';
  const deleteNode = () => {
    const position = props.getPos();
    if (typeof position !== 'number') return;
    props.view.dispatch(props.view.state.tr.delete(position, position + currentNode.nodeSize));
  };
  const root = createRoot(dom);
  const renderChip = () =>
    root.render(
      currentNode.attrs.kind === 'quote' ? (
        <ContentChip kind='quote' text={readString(currentNode.attrs.text)} onRemove={deleteNode} />
      ) : (
        <ContentChip
          kind='attachment'
          name={readString(currentNode.attrs.name)}
          size={typeof currentNode.attrs.size === 'number' ? currentNode.attrs.size : 0}
          mimeType={readString(currentNode.attrs.mimeType)}
          url={readString(currentNode.attrs.localUrl) || readString(currentNode.attrs.url)}
          uploading={Boolean(readString(currentNode.attrs.localUrl))}
          onRemove={deleteNode}
        />
      ),
    );
  renderChip();

  return {
    dom,
    update(updatedNode: typeof props.node) {
      if (updatedNode.type !== props.node.type) return false;
      currentNode = updatedNode;
      renderChip();
      return true;
    },
    destroy: () => queueMicrotask(() => root.unmount()),
  };
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
    return createComposerChipView;
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
  blur: () => void;
  clear: () => void;
  insertQuote: (text: string) => void;
  insertFiles: (files: File[]) => Promise<void>;
};

type RichComposerEditorProps = {
  ref?: (editor: RichComposerEditorHandle | null) => void;
  id: string;
  document: ComposerDocument;
  onChange: (document: ComposerDocument) => void;
  onFocus?: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel: string;
  className?: string;
};

export function RichComposerEditor(props: RichComposerEditorProps) {
  const toast = useToast();
  const [editor, setEditor] = useState<Editor>();
  const editorRef = useRef<Editor | null>(null);
  const editorElement = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const toastRef = useRef(toast);
  const insertQuoteRef = useRef<(text: string) => void>(() => {});
  const insertFilesRef = useRef<(files: File[]) => Promise<void>>(async () => {});
  propsRef.current = props;
  toastRef.current = toast;

  const updateAttachment = (id: string, attachment: PendingAttachment) => {
    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed) {
      return;
    }

    currentEditor
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
    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed) {
      return;
    }

    currentEditor
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
    const currentEditor = editorRef.current;
    if (!currentEditor || !trimmed) {
      return;
    }

    currentEditor
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
    const currentEditor = editorRef.current;
    if (!currentEditor || propsRef.current.disabled || files.length === 0) {
      return;
    }

    const queued: { file: File; attachment: PendingAttachment }[] = [];
    let totalSize = propsRef.current.document.reduce(
      (sum, item) => sum + (item.type === 'attachment' ? item.attachment.size : 0),
      0,
    );
    for (const file of files) {
      const validationMessage = getBase64ImageValidationMessage(file);
      if (validationMessage) {
        toastRef.current.warning(validationMessage);
        continue;
      }

      if (totalSize + file.size > BASE64_MESSAGE_MAX_SIZE) {
        toastRef.current.warning('每条消息的图片总大小不能超过 8MB。');
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

    currentEditor
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
          toastRef.current.error(`上传图片「${file.name}」失败：${detail}`);
          removeAttachment(attachment.id);
        } finally {
          if (attachment.localUrl) {
            URL.revokeObjectURL(attachment.localUrl);
          }
        }
      }),
    );
  }

  insertQuoteRef.current = insertQuote;
  insertFilesRef.current = insertFiles;

  useEffect(() => {
    const element = editorElement.current;
    if (!element) return;
    let cancelled = false;
    let mountedEditor: Editor | null = null;

    queueMicrotask(() => {
      if (cancelled) return;
      const initialProps = propsRef.current;

      const nextEditor = new Editor({
        element,
        extensions,
        content: editorJSONFromComposerDocument(initialProps.document),
        editable: !initialProps.disabled,
        editorProps: {
          attributes: {
            id: initialProps.id,
            role: 'textbox',
            'aria-label': initialProps.ariaLabel,
            class: cn(
              'max-h-50 overflow-y-auto whitespace-pre-wrap break-words px-2 py-3 text-sm leading-relaxed outline-none sm:text-base',
              initialProps.className,
            ),
          },
          handleKeyDown: (_, event) => {
            if (event.key !== 'Enter' || !event.ctrlKey || event.shiftKey) return false;
            event.preventDefault();
            propsRef.current.onSubmit();
            return true;
          },
          handlePaste: (_, event) => {
            if (!event.clipboardData) return false;
            const files = collectClipboardFiles(event.clipboardData);
            if (files.length === 0) return false;
            event.preventDefault();
            void insertFilesRef.current(files);
            return true;
          },
        },
        onUpdate: ({ editor: updatedEditor }) => {
          propsRef.current.onChange(composerDocumentFromEditorJSON(updatedEditor.getJSON()));
        },
      });
      mountedEditor = nextEditor;
      editorRef.current = nextEditor;
      setEditor(nextEditor);
      initialProps.ref?.({
        focus: () => nextEditor.commands.focus(undefined, { scrollIntoView: false }),
        blur: () => nextEditor.commands.blur(),
        clear: () => {
          nextEditor.commands.setContent(editorJSONFromComposerDocument([]), {
            emitUpdate: false,
          });
        },
        insertQuote: (text) => insertQuoteRef.current(text),
        insertFiles: (files) => insertFilesRef.current(files),
      });
      if (initialProps.autoFocus) nextEditor.commands.focus('end');
    });

    return () => {
      cancelled = true;
      editorRef.current = null;
      propsRef.current.ref?.(null);
      mountedEditor?.destroy();
    };
  }, []);

  useEffect(() => {
    const disabled = props.disabled ?? false;
    if (editor && editor.isEditable === disabled) editor.setEditable(!disabled);
  }, [editor, props.disabled]);

  useEffect(() => {
    if (!editor) return;
    if (
      JSON.stringify(composerDocumentFromEditorJSON(editor.getJSON())) !==
      JSON.stringify(props.document)
    ) {
      editor.commands.setContent(editorJSONFromComposerDocument(props.document), {
        emitUpdate: false,
      });
    }
  }, [editor, props.document]);

  useEffect(() => {
    if (props.autoFocus) editor?.commands.focus('end');
  }, [editor, props.autoFocus]);

  return (
    <div className='relative min-h-12 min-w-0 flex-1' onFocus={props.onFocus}>
      <div ref={editorElement} />
    </div>
  );
}
