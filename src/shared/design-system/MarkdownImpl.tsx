import { memo, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { createCodePlugin } from '@streamdown/code';
import {
  Streamdown,
  defaultRehypePlugins,
  type LinkSafetyModalProps,
  type PluginConfig,
} from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { createMathPlugin } from '@streamdown/math';
import { Button } from '@/shared/design-system/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/design-system/dialog';
import { toast } from '@/shared/app-shell/useToast';
import 'streamdown/styles.css';
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

const plugins: PluginConfig = {
  cjk,
  code: createCodePlugin({
    themes: ['github-light', 'github-dark'],
  }),
  math: createMathPlugin({ singleDollarTextMath: true }),
};

const copyResetDelayMs = 2000;

function LinkSafetyModal({ isOpen, onClose, onConfirm, url }: LinkSafetyModalProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
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
    if (open) {
      return;
    }

    clearCopiedState();
    onClose();
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);

        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current);
        }

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
      <DialogContent
        className='left-0 top-0 h-dvh max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 px-5 pb-5 pt-14 shadow-none sm:max-w-none'
        showCloseButton={false}
      >
        <div className='mx-auto flex h-full w-full max-w-3xl flex-col gap-6'>
          <DialogHeader className='gap-3 text-left'>
            <DialogTitle className='text-2xl sm:text-3xl'>Open external link</DialogTitle>
            <DialogDescription className='max-w-2xl text-sm sm:text-base'>
              This link points outside the app. Copy it or open it in a new tab.
            </DialogDescription>
          </DialogHeader>
          <div className='flex min-h-0 flex-1 items-center'>
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

const linkSafety = {
  enabled: true,
  renderModal: (props: LinkSafetyModalProps) => <LinkSafetyModal {...props} />,
};

type StreamdownBlockProps = {
  markdown: string;
  blockIsAnimating: boolean;
  observer: ResizeObserver;
};

const StreamdownBlock = memo(function StreamdownBlock({
  markdown,
  blockIsAnimating,
  observer,
}: StreamdownBlockProps) {
  const blockElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = blockElRef.current;
    if (!el) return;
    observer.observe(el);
    return () => {
      observer.unobserve(el);
    };
  }, [blockIsAnimating, observer]);

  return (
    <div ref={blockElRef}>
      <Streamdown
        plugins={plugins}
        rehypePlugins={[defaultRehypePlugins.sanitize, defaultRehypePlugins.harden]}
        isAnimating={blockIsAnimating}
        linkSafety={linkSafety}
      >
        {markdown}
      </Streamdown>
    </div>
  );
});

function MarkdownImpl({ content, isAnimating = false }: Props) {
  const paragraphs = splitMarkdownParagraphs(content);
  const ro = useRef<ResizeObserver | null>(null);

  function getObserver() {
    if (!ro.current) {
      ro.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const node = entry.target;
          if (!(node instanceof HTMLElement)) continue;

          const h = Math.round(entry.borderBoxSize[0].blockSize);
          if (!node.style.contentVisibility) {
            node.style.contentVisibility = 'auto';
          }
          node.style.containIntrinsicBlockSize = `${h}px`;
        }
      });
    }
    return ro.current;
  }
  useEffect(() => {
    return () => ro.current?.disconnect();
  }, []);

  return (
    <div className='space-y-3 font-light [&_b]:font-black [&_strong]:font-black [&_b]:text-foreground [&_strong]:text-foreground'>
      {paragraphs.map((paragraph, i) => (
        <StreamdownBlock
          markdown={paragraph}
          blockIsAnimating={isAnimating && i === paragraphs.length - 1}
          observer={getObserver()}
          key={i}
        />
      ))}
    </div>
  );
}

export default MarkdownImpl;
