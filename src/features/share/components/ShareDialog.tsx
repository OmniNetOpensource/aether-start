import { Check, Copy, Link2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/useToast';
import {
  createConversationShareFn,
  getConversationShareFn,
  revokeConversationShareFn,
} from '@/server/functions/shares';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import type { ConversationShareStatus } from '@/types/share';

export type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const buildShareUrl = (token: string) =>
  typeof window === 'undefined'
    ? `/share/${encodeURIComponent(token)}`
    : `${window.location.origin}/share/${encodeURIComponent(token)}`;

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const messages = useChatSessionStore((state) => state.messages);
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const conversationId = useChatSessionStore((state) => state.conversationId);
  const conversations = useChatSessionStore((state) => state.conversations);
  const status = useChatRequestStore((state) => state.status);
  const isBusy = status !== 'idle';

  const [shareStatus, setShareStatus] = useState<ConversationShareStatus>('not_shared');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareActionLoading, setShareActionLoading] = useState<'create' | 'revoke' | null>(null);
  const [copied, setCopied] = useState(false);

  const pathMessageCount = currentPath.filter((id) => messages[id - 1] !== undefined).length;

  const conversationTitle = (() => {
    if (!conversationId) return 'Aether';
    const conversation = conversations.find((item) => item.id === conversationId);
    return conversation?.title?.trim() || 'Aether';
  })();

  const shareUrl = shareToken ? buildShareUrl(shareToken) : null;

  const resetState = () => {
    setShareStatus('not_shared');
    setShareToken(null);
    setShareLoading(false);
    setShareActionLoading(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open || !conversationId) {
      if (open && !conversationId) {
        setShareStatus('not_shared');
        setShareToken(null);
      }
      return;
    }

    let cancelled = false;
    setShareLoading(true);

    getConversationShareFn({ data: { conversationId } })
      .then((result) => {
        if (!cancelled) {
          setShareStatus(result.status);
          setShareToken(result.token ?? null);
        }
      })
      .catch((error) => {
        console.error('Failed to load share status', error);
        if (!cancelled) {
          toast.error('Failed to load share status');
          setShareStatus('not_shared');
          setShareToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setShareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const handleCreateShare = async () => {
    if (!conversationId) {
      toast.error('No conversation selected');
      return;
    }
    if (pathMessageCount === 0) {
      toast.warning('There are no messages to share');
      return;
    }

    setShareActionLoading('create');
    try {
      const result = await createConversationShareFn({
        data: { conversationId, title: conversationTitle },
      });
      setShareStatus('active');
      setShareToken(result.token);
      toast.success('Share URL created');
    } catch (error) {
      console.error('Failed to create share', error);
      toast.error('Failed to create share URL');
    } finally {
      setShareActionLoading(null);
    }
  };

  const handleRevokeShare = async () => {
    if (!conversationId) return;

    setShareActionLoading('revoke');
    try {
      await revokeConversationShareFn({ data: { conversationId } });
      setShareStatus('revoked');
      toast.success('Share URL revoked');
    } catch (error) {
      console.error('Failed to revoke share', error);
      toast.error('Failed to revoke share URL');
    } finally {
      setShareActionLoading(null);
    }
  };

  const handleCopyUrl = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Share URL copied');
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy', error);
      toast.error('Failed to copy share URL');
    }
  };

  const isLoading = shareActionLoading !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className='flex max-h-[90vh] flex-col overflow-hidden px-6 py-6 sm:max-w-2xl'
        aria-describedby='share-dialog-description'
      >
        <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-hidden'>
          {/* Share URL section */}
          <section className='shrink-0 space-y-3' aria-labelledby='share-url-heading'>
            <h3
              id='share-url-heading'
              className='flex items-center gap-2 text-sm font-medium text-(--text-primary)'
            >
              <Link2 className='h-4 w-4 shrink-0 text-(--text-tertiary)' />
              Share link
            </h3>

            {shareLoading ? (
              <div
                className='flex h-20 items-center gap-2 rounded-lg border border-border bg-(--surface-muted) px-4'
                aria-live='polite'
              >
                <Loader2 className='h-4 w-4 shrink-0 animate-spin text-(--text-tertiary)' />
                <span className='text-sm text-(--text-tertiary)'>Loading…</span>
              </div>
            ) : shareStatus === 'active' && shareUrl ? (
              <div className='space-y-3'>
                <div className='flex gap-2'>
                  <div className='min-w-0 flex-1 break-all rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-(--text-secondary)'>
                    {shareUrl}
                  </div>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={handleCopyUrl}
                    disabled={isLoading}
                    aria-label={copied ? 'Copied' : 'Copy URL'}
                    className='shrink-0'
                  >
                    {copied ? (
                      <Check className='h-4 w-4 text-green-600' />
                    ) : (
                      <Copy className='h-4 w-4' />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={handleRevokeShare}
                    disabled={isLoading}
                    className='text-(--text-tertiary) hover:text-destructive hover:bg-(--status-destructive-muted)'
                  >
                    {shareActionLoading === 'revoke' ? (
                      <>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        Revoking…
                      </>
                    ) : (
                      <>
                        <XCircle className='h-4 w-4' />
                        Revoke link
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <p className='text-sm text-(--text-tertiary)'>
                  {shareStatus === 'revoked'
                    ? 'Link was revoked. Create a new one to share again.'
                    : 'Anyone with the link can view this conversation.'}
                </p>
                <Button
                  type='button'
                  size='sm'
                  onClick={handleCreateShare}
                  disabled={isLoading || isBusy || pathMessageCount === 0}
                  className='shrink-0'
                >
                  {shareActionLoading === 'create' ? (
                    <>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      Creating…
                    </>
                  ) : shareStatus === 'revoked' ? (
                    'Create new link'
                  ) : (
                    'Create link'
                  )}
                </Button>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className='flex shrink-0 flex-row justify-end gap-2 border-t border-border pt-4'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => handleOpenChange(false)}
            className='text-(--text-secondary)'
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
