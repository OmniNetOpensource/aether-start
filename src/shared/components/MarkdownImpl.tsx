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
import 'streamdown/styles.css';
import 'katex/dist/katex.min.css';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      current.push(line);
    } else if (!inCodeBlock && line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join('\n'));
  }

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
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);

      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, copyResetDelayMs);
    });
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
            <div className='w-full rounded-lg border bg-(--surface-muted) p-4 font-mono text-sm break-all sm:p-5 sm:text-base'>
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
  plugins: PluginConfig;
};

const StreamdownBlock = memo(function StreamdownBlock({
  markdown,
  blockIsAnimating,
  plugins,
}: StreamdownBlockProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    if (blockIsAnimating) {
      el.style.contentVisibility = '';
      el.style.containIntrinsicBlockSize = '';
      return;
    }

    const h = Math.round(el.getBoundingClientRect().height);
    if (h > 0) {
      el.style.contentVisibility = 'auto';
      el.style.containIntrinsicBlockSize = `${h}px`;
    } else {
      el.style.contentVisibility = '';
      el.style.containIntrinsicBlockSize = '';
    }
  }, [blockIsAnimating]);

  return (
    <div ref={wrapRef}>
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

  return (
    <div className='space-y-3 [&_b]:font-extrabold [&_strong]:font-extrabold'>
      {paragraphs.map((paragraph, i) => (
        <StreamdownBlock
          key={i}
          markdown={paragraph}
          blockIsAnimating={isAnimating && i === paragraphs.length - 1}
          plugins={plugins}
        />
      ))}
    </div>
  );
}

export default MarkdownImpl;
