import {
  createContext,
  createMemo,
  createSignal,
  For,
  omit,
  onCleanup,
  useContext,
  type Accessor,
  type Component,
} from 'solid-js';
import { createComponent, Dynamic, type JSX } from '@solidjs/web';
import { Check, Copy, ExternalLink } from '@/shared/design-system/icons';
import {
  toJsxRuntime,
  type Components,
  type Props as RuntimeProps,
} from 'hast-util-to-jsx-runtime';
import { harden as rehypeHarden } from 'rehype-harden';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkGfmStrikethroughCjkFriendly from 'remark-cjk-friendly-gfm-strikethrough';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remend from 'remend';
import { unified } from 'unified';
import { useToast } from '@/shared/app-shell/useToast';
import { Button } from '@/shared/design-system/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/design-system/dialog';
import { HighlightedCode } from '@/shared/design-system/HighlightedCode';
import 'katex/dist/katex.min.css';

function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    if (current.length === 0) return;
    paragraphs.push(current.join('\n'));
    current = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        flush();
        inCodeBlock = true;
        current.push(line);
      } else {
        current.push(line);
        inCodeBlock = false;
        flush();
      }
      continue;
    }
    if (inCodeBlock) {
      current.push(line);
    } else if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }

  flush();
  return paragraphs;
}

type Props = {
  content: string;
  isAnimating?: boolean;
  splitParagraphs?: boolean;
};

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'tel'],
  },
};

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkCjkFriendly)
  .use(remarkGfm)
  .use(remarkGfmStrikethroughCjkFriendly)
  .use(remarkMath, { singleDollarTextMath: true })
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHarden, {
    allowedImagePrefixes: ['*'],
    allowedLinkPrefixes: ['*'],
    allowedProtocols: ['*'],
    allowDataImages: true,
  })
  .use(rehypeKatex);

const copyResetDelayMs = 2000;
const MarkdownAnimatingContext = createContext<Accessor<boolean>>(() => false);
const Fragment = (props: RuntimeProps) => props.children;
const isComponent = (type: unknown): type is Component<RuntimeProps> => typeof type === 'function';
const jsx = (type: unknown, props: RuntimeProps) => {
  if (isComponent(type)) return createComponent(type, props);
  if (typeof type === 'string') return createComponent(Dynamic, { component: type, ...props });
  throw new TypeError('Unsupported Markdown element');
};

function LinkSafetyModal(props: { onClose: () => void; onConfirm: () => void; url: string }) {
  const toast = useToast();
  const [copied, setCopied] = createSignal(false);
  let copyTimer: number | undefined;

  onCleanup(() => {
    if (copyTimer !== undefined) window.clearTimeout(copyTimer);
  });

  const clearCopiedState = () => {
    if (copyTimer !== undefined) window.clearTimeout(copyTimer);
    copyTimer = undefined;
    setCopied(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    clearCopiedState();
    props.onClose();
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(props.url).then(
      () => {
        setCopied(true);
        if (copyTimer !== undefined) window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => {
          setCopied(false);
          copyTimer = undefined;
        }, copyResetDelayMs);
      },
      (error) => {
        console.error('Failed to copy external link:', error);
        toast.error('Failed to copy link');
      },
    );
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent class='flex h-[50dvh] max-w-[calc(100%-2rem)] flex-col gap-6 overflow-hidden sm:max-w-3xl'>
        <div class='flex min-h-0 flex-1 flex-col gap-6'>
          <DialogHeader class='gap-3 text-left'>
            <DialogTitle class='text-2xl sm:text-3xl'>Open external link</DialogTitle>
            <DialogDescription class='max-w-2xl text-sm sm:text-base'>
              This link points outside the app. Copy it or open it in a new tab.
            </DialogDescription>
          </DialogHeader>
          <div class='flex min-h-0 flex-1 items-stretch overflow-y-auto'>
            <div class='w-full rounded-lg border bg-muted p-4 font-mono text-sm break-all sm:p-5 sm:text-base'>
              {props.url}
            </div>
          </div>
          <div class='flex gap-3 sm:justify-end'>
            <Button
              class='flex-1 sm:flex-none'
              onClick={handleCopy}
              size='lg'
              type='button'
              variant='outline'
            >
              {copied() ? <Check class='size-4' /> : <Copy class='size-4' />}
              {copied() ? 'Copied' : 'Copy'}
            </Button>
            <Button class='flex-1 sm:flex-none' onClick={props.onConfirm} size='lg' type='button'>
              <ExternalLink class='size-4' />
              Visit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownLink(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...omit(props, 'children')} data-markdown='link'>
      {props.children}
    </a>
  );
}

function MarkdownTable(props: JSX.HTMLAttributes<HTMLTableElement>) {
  return (
    <div class='my-4 max-w-full overflow-x-auto' data-markdown='table-container'>
      <table {...omit(props, 'children')}>{props.children}</table>
    </div>
  );
}

function MarkdownCodeBlock(props: { code: string; language: string }) {
  const toast = useToast();
  const isAnimating = useContext(MarkdownAnimatingContext);
  const [copied, setCopied] = createSignal(false);
  let copyTimer: number | undefined;

  onCleanup(() => {
    if (copyTimer !== undefined) window.clearTimeout(copyTimer);
  });

  const handleCopy = () => {
    void navigator.clipboard.writeText(props.code).then(
      () => {
        setCopied(true);
        if (copyTimer !== undefined) window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => {
          setCopied(false);
          copyTimer = undefined;
        }, copyResetDelayMs);
      },
      (error) => {
        console.error('Failed to copy code:', error);
        toast.error('Failed to copy code');
      },
    );
  };

  return (
    <section data-language={props.language} data-markdown='code-block'>
      <header>
        <span>{props.language || 'text'}</span>
        <button disabled={isAnimating()} onClick={handleCopy} title='Copy code' type='button'>
          {copied() ? <Check /> : <Copy />}
        </button>
      </header>
      <HighlightedCode code={props.code} isCompleted={!isAnimating()} language={props.language} />
    </section>
  );
}

function MarkdownPre(props: JSX.HTMLAttributes<HTMLPreElement> & { node?: unknown }) {
  if (!props.node || typeof props.node !== 'object' || !('children' in props.node)) {
    return <pre {...omit(props, 'children', 'node')}>{props.children}</pre>;
  }
  const children = props.node.children;
  if (!Array.isArray(children))
    return <pre {...omit(props, 'children', 'node')}>{props.children}</pre>;
  const codeNode = children[0];
  if (
    !codeNode ||
    typeof codeNode !== 'object' ||
    !('properties' in codeNode) ||
    !('children' in codeNode)
  ) {
    return <pre {...omit(props, 'children', 'node')}>{props.children}</pre>;
  }
  const properties = codeNode.properties;
  const codeChildren = codeNode.children;
  const classes: unknown[] =
    properties &&
    typeof properties === 'object' &&
    'className' in properties &&
    Array.isArray(properties.className)
      ? properties.className
      : [];
  const code = Array.isArray(codeChildren)
    ? codeChildren
        .flatMap((child) =>
          typeof child === 'object' && child && 'value' in child && typeof child.value === 'string'
            ? [child.value]
            : [],
        )
        .join('')
    : '';
  const languageClass = classes.find(
    (className: unknown) => typeof className === 'string' && className.startsWith('language-'),
  );
  const language = typeof languageClass === 'string' ? languageClass.slice('language-'.length) : '';

  return <MarkdownCodeBlock code={code.replace(/\n$/, '')} language={language} />;
}

const markdownComponents: Partial<Components> = {
  a: MarkdownLink,
  img: ({ alt, ...props }) => <img {...props} alt={alt ?? ''} data-markdown='image' />,
  pre: MarkdownPre,
  table: MarkdownTable,
};

function MarkdownBlock(props: { isAnimating: boolean; markdown: string }) {
  const tree = createMemo(() => {
    const source = props.isAnimating
      ? remend(props.markdown, { linkMode: 'text-only' })
      : props.markdown;
    return markdownProcessor.runSync(markdownProcessor.parse(source));
  });

  return (
    <div style={{ 'content-visibility': 'auto', 'contain-intrinsic-block-size': 'auto 0px' }}>
      <MarkdownAnimatingContext value={() => props.isAnimating}>
        {toJsxRuntime(tree(), {
          Fragment,
          components: markdownComponents,
          jsx,
          jsxs: jsx,
          passNode: true,
          passKeys: false,
          elementAttributeNameCase: 'html',
        })}
      </MarkdownAnimatingContext>
    </div>
  );
}

function MarkdownImpl(props: Props) {
  const [externalUrl, setExternalUrl] = createSignal<string>();
  const paragraphs = createMemo(() =>
    props.splitParagraphs === false ? [props.content] : splitMarkdownParagraphs(props.content),
  );
  const renderExternalLinkModal = () => {
    const url = externalUrl();
    if (!url) return null;

    return (
      <LinkSafetyModal
        onClose={() => setExternalUrl()}
        onConfirm={() => {
          window.open(url, '_blank', 'noopener,noreferrer');
          setExternalUrl();
        }}
        url={url}
      />
    );
  };

  return (
    <>
      <div
        class='aether-markdown space-y-3 font-light [&_b]:font-black [&_strong]:font-black [&_b]:text-foreground [&_strong]:text-foreground'
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          const link = event.target.closest<HTMLAnchorElement>('a[data-markdown="link"]');
          if (!link) return;
          event.preventDefault();
          setExternalUrl(link.href);
        }}
      >
        <For each={paragraphs()}>
          {(paragraph, index) => (
            <MarkdownBlock
              isAnimating={(props.isAnimating ?? false) && index() === paragraphs().length - 1}
              markdown={paragraph}
            />
          )}
        </For>
      </div>
      {renderExternalLinkModal()}
    </>
  );
}

export default MarkdownImpl;
