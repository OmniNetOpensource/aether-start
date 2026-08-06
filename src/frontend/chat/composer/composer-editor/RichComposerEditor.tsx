import { createEffect, createSignal, onCleanup } from 'solid-js';
import { render } from '@solidjs/web';
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
import {
  isComposerDocumentEmpty,
  type ComposerDocument,
  type PendingAttachment,
} from './composer-document';
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
  const [node, setNode] = createSignal(props.node);
  const dom = document.createElement('span');
  dom.contentEditable = 'false';
  dom.className = 'group mx-1 inline-flex max-w-64 align-middle';
  const deleteNode = () => {
    const position = props.getPos();
    if (typeof position !== 'number') return;
    props.view.dispatch(props.view.state.tr.delete(position, position + node().nodeSize));
  };
  const dispose = render(
    () =>
      node().attrs.kind === 'quote' ? (
        <ContentChip kind='quote' text={readString(node().attrs.text)} onRemove={deleteNode} />
      ) : (
        <ContentChip
          kind='attachment'
          name={readString(node().attrs.name)}
          size={typeof node().attrs.size === 'number' ? node().attrs.size : 0}
          mimeType={readString(node().attrs.mimeType)}
          url={readString(node().attrs.localUrl) || readString(node().attrs.url)}
          uploading={!!readString(node().attrs.localUrl)}
          onRemove={deleteNode}
        />
      ),
    dom,
  );

  return {
    dom,
    update(updatedNode: typeof props.node) {
      if (updatedNode.type !== props.node.type) return false;
      setNode(updatedNode);
      return true;
    },
    destroy: dispose,
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
  placeholder: string;
  class?: string;
};

export function RichComposerEditor(props: RichComposerEditorProps) {
  const toast = useToast();
  const [editor, setEditor] = createSignal<Editor>();
  let editorElement: HTMLDivElement | undefined;
  let disposeEditor: (() => void) | undefined;

  const updateAttachment = (id: string, attachment: PendingAttachment) => {
    const currentEditor = editor();
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
    const currentEditor = editor();
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
    const currentEditor = editor();
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
    const currentEditor = editor();
    if (!currentEditor || props.disabled || files.length === 0) {
      return;
    }

    const queued: { file: File; attachment: PendingAttachment }[] = [];
    let totalSize = props.document.reduce(
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

  const mountEditor = (element: HTMLDivElement) => {
    editorElement = element;
    queueMicrotask(() => {
      if (editorElement !== element || editor()) return;

      const mountedEditor = new Editor({
        element,
        extensions,
        content: editorJSONFromComposerDocument(props.document),
        editable: !props.disabled,
        editorProps: {
          attributes: {
            id: props.id,
            role: 'textbox',
            'aria-label': props.placeholder,
            class: cn(
              'max-h-50 overflow-y-auto whitespace-pre-wrap break-words px-2 py-3 text-sm leading-relaxed outline-none sm:text-base',
              props.class,
            ),
          },
          handleKeyDown: (_, event) => {
            if (event.key !== 'Enter' || !event.ctrlKey || event.shiftKey) return false;
            event.preventDefault();
            props.onSubmit();
            return true;
          },
          handlePaste: (_, event) => {
            if (!event.clipboardData) return false;
            const files = collectClipboardFiles(event.clipboardData);
            if (files.length === 0) return false;
            event.preventDefault();
            void insertFiles(files);
            return true;
          },
        },
        onUpdate: ({ editor: updatedEditor }) => {
          props.onChange(composerDocumentFromEditorJSON(updatedEditor.getJSON()));
        },
      });
      setEditor(mountedEditor);
      props.ref?.({
        focus: () => mountedEditor.commands.focus(),
        clear: () => {
          mountedEditor.commands.setContent(editorJSONFromComposerDocument([]), {
            emitUpdate: false,
          });
        },
        insertQuote,
        insertFiles,
      });
      if (props.autoFocus) mountedEditor.commands.focus('end');
      disposeEditor = () => {
        setEditor();
        props.ref?.(null);
        mountedEditor.destroy();
      };
    });
  };

  onCleanup(() => {
    editorElement = undefined;
    disposeEditor?.();
  });

  createEffect(
    () => ({ currentEditor: editor(), disabled: props.disabled ?? false }),
    ({ currentEditor, disabled }) => {
      if (currentEditor && currentEditor.isEditable === disabled)
        currentEditor.setEditable(!disabled);
    },
  );

  createEffect(
    () => ({ currentEditor: editor(), document: props.document }),
    ({ currentEditor, document }) => {
      if (!currentEditor) return;
      if (
        JSON.stringify(composerDocumentFromEditorJSON(currentEditor.getJSON())) !==
        JSON.stringify(document)
      ) {
        currentEditor.commands.setContent(editorJSONFromComposerDocument(document), {
          emitUpdate: false,
        });
      }
    },
  );

  createEffect(
    () => ({ currentEditor: editor(), autoFocus: props.autoFocus ?? false }),
    ({ currentEditor, autoFocus }) => {
      if (autoFocus) currentEditor?.commands.focus('end');
    },
  );

  return (
    <div class='relative min-h-12 min-w-0 flex-1' onFocusIn={props.onFocus}>
      {isComposerDocumentEmpty(props.document) ? (
        <span class='pointer-events-none absolute left-2 top-3 text-sm text-muted-foreground sm:text-base'>
          {props.placeholder}
        </span>
      ) : null}
      <div ref={mountEditor} />
    </div>
  );
}
