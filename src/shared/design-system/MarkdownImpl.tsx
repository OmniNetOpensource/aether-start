import {
  createContext,
  isValidElement,
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime';
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
import { toast } from '@/shared/app-shell/useToast';
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
const MarkdownAnimatingContext = createContext(false);

function LinkSafetyModal({
  isOpen,
  onClose,
  onConfirm,
  url,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  url: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const clearCopiedState = () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    setCopied(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    clearCopiedState();
    onClose();
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, copyResetDelayMs);
      },
      (error) => {
        console.error('Failed to copy external link:', error);
        toast.error('Failed to copy link');
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='flex h-[50dvh] max-w-[calc(100%-2rem)] flex-col gap-6 overflow-hidden sm:max-w-3xl'>
        <div className='flex min-h-0 flex-1 flex-col gap-6'>
          <DialogHeader className='gap-3 text-left'>
            <DialogTitle className='text-2xl sm:text-3xl'>Open external link</DialogTitle>
            <DialogDescription className='max-w-2xl text-sm sm:text-base'>
              This link points outside the app. Copy it or open it in a new tab.
            </DialogDescription>
          </DialogHeader>
          <div className='flex min-h-0 flex-1 items-stretch overflow-y-auto'>
            <div className='w-full rounded-lg border bg-muted p-4 font-mono text-sm break-all sm:p-5 sm:text-base'>
              {url}
            </div>
          </div>
          <div className='flex gap-3 sm:justify-end'>
            <Button
              className='flex-1 sm:flex-none'
              onClick={handleCopy}
              size='lg'
              type='button'
              variant='outline'
            >
              {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className='flex-1 sm:flex-none' onClick={onConfirm} size='lg' type='button'>
              <ExternalLink className='size-4' />
              Visit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownLink({ children, href, ...props }: ComponentProps<'a'>) {
  const [isOpen, setIsOpen] = useState(false);

  if (!href) return <a {...props}>{children}</a>;

  return (
    <>
      <a
        {...props}
        data-markdown='link'
        href={href}
        onClick={(event) => {
          event.preventDefault();
          setIsOpen(true);
        }}
      >
        {children}
      </a>
      <LinkSafetyModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={() => {
          window.open(href, '_blank', 'noopener,noreferrer');
          setIsOpen(false);
        }}
        url={href}
      />
    </>
  );
}

function MarkdownTable({ children, ...props }: ComponentProps<'table'>) {
  return (
    <div className='my-4 max-w-full overflow-x-auto' data-markdown='table-container'>
      <table {...props}>{children}</table>
    </div>
  );
}

function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
  const isAnimating = useContext(MarkdownAnimatingContext);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, copyResetDelayMs);
      },
      (error) => {
        console.error('Failed to copy code:', error);
        toast.error('Failed to copy code');
      },
    );
  };

  return (
    <section data-language={language} data-markdown='code-block'>
      <header>
        <span>{language || 'text'}</span>
        <button disabled={isAnimating} onClick={handleCopy} title='Copy code' type='button'>
          {copied ? <Check /> : <Copy />}
        </button>
      </header>
      <HighlightedCode code={code} isCompleted={!isAnimating} language={language} />
    </section>
  );
}

function MarkdownPre({ children }: ComponentProps<'pre'>) {
  if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) {
    return <pre>{children}</pre>;
  }

  const code = typeof children.props.children === 'string' ? children.props.children : '';
  const language = children.props.className?.match(/language-([^\s]+)/)?.[1] ?? '';

  return <MarkdownCodeBlock code={code.replace(/\n$/, '')} language={language} />;
}

const markdownComponents: Partial<Components> = {
  a: MarkdownLink,
  img: ({ alt, ...props }) => <img {...props} alt={alt ?? ''} data-markdown='image' />,
  pre: MarkdownPre,
  table: MarkdownTable,
};

const MarkdownBlock = memo(function MarkdownBlock({
  isAnimating,
  markdown,
}: {
  isAnimating: boolean;
  markdown: string;
}) {
  const source = isAnimating ? remend(markdown, { linkMode: 'text-only' }) : markdown;
  const tree = markdownProcessor.runSync(markdownProcessor.parse(source));

  return (
    <div style={{ contentVisibility: 'auto', containIntrinsicBlockSize: 'auto 0px' }}>
      <MarkdownAnimatingContext.Provider value={isAnimating}>
        {toJsxRuntime(tree, {
          Fragment,
          components: markdownComponents,
          jsx,
          jsxs,
        })}
      </MarkdownAnimatingContext.Provider>
    </div>
  );
});

function MarkdownImpl({ content, isAnimating = false }: Props) {
  const paragraphs = splitMarkdownParagraphs(content);

  return (
    <div className='aether-markdown space-y-3 font-light [&_b]:font-black [&_strong]:font-black [&_b]:text-foreground [&_strong]:text-foreground'>
      {paragraphs.map((paragraph, index) => (
        <MarkdownBlock
          isAnimating={isAnimating && index === paragraphs.length - 1}
          key={index}
          markdown={paragraph}
        />
      ))}
    </div>
  );
}

export default MarkdownImpl;
