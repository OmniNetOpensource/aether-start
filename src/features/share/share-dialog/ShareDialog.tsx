import { Check, Copy, Link2, Loader2, XCircle } from '@/shared/design-system/icons';
import { createEffect, createSignal } from 'solid-js';
import { Button } from '@/shared/design-system/button';
import { Dialog, DialogContent, DialogFooter } from '@/shared/design-system/dialog';
import { useToast } from '@/shared/app-shell/useToast';
import {
  createConversationShareFn,
  getConversationShareFn,
  revokeConversationShareFn,
} from '@/features/share/share-record';
import { useConversationsQuery, selectAllConversations } from '@/features/conversations/session';
import { status } from '@/features/chat/agent-runtime/chat-runtime';
import {
  currentPath,
  messages,
} from '@/features/conversations/conversation-tree/message-tree-state';
import { conversationId } from '@/features/conversations/session/conversation-meta';
import type { ConversationShareStatus } from '@/features/share/share-record';

export type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const buildShareUrl = (token: string) =>
  typeof window === 'undefined'
    ? `/share/${encodeURIComponent(token)}`
    : `${window.location.origin}/share/${encodeURIComponent(token)}`;

export function ShareDialog(props: ShareDialogProps) {
  const toast = useToast();
  const conversations = useConversationsQuery();
  const isBusy = () => status() !== 'idle';

  const [shareStatus, setShareStatus] = createSignal<ConversationShareStatus>('not_shared');
  const [shareToken, setShareToken] = createSignal<string | null>(null);
  const [shareLoading, setShareLoading] = createSignal(false);
  const [shareActionLoading, setShareActionLoading] = createSignal<'create' | 'revoke' | null>(
    null,
  );
  const [copied, setCopied] = createSignal(false);
  let requestId = 0;

  const pathMessageCount = () =>
    currentPath().filter((id) => messages()[id - 1] !== undefined).length;

  const conversationTitle = () => {
    if (!conversationId()) return 'Aether';
    const conversation = selectAllConversations(conversations.data).find(
      (item) => item.id === conversationId(),
    );
    return conversation?.title?.trim() || 'Aether';
  };

  const shareUrl = () => {
    const token = shareToken();
    return token ? buildShareUrl(token) : null;
  };

  const resetState = () => {
    setShareStatus('not_shared');
    setShareToken(null);
    setShareLoading(false);
    setShareActionLoading(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    props.onOpenChange(nextOpen);
  };

  createEffect(
    () => ({ open: props.open, conversationId: conversationId() }),
    ({ open, conversationId }) => {
      if (!open || !conversationId) {
        if (open && !conversationId) {
          setShareStatus('not_shared');
          setShareToken(null);
        }
        return;
      }

      const currentRequestId = ++requestId;
      setShareLoading(true);

      getConversationShareFn({ data: { conversationId } })
        .then((result) => {
          if (requestId === currentRequestId) {
            setShareStatus(result.status);
            setShareToken(result.token ?? null);
          }
        })
        .catch((error) => {
          console.error('Failed to load share status', error);
          if (requestId === currentRequestId) {
            toast.error('Failed to load share status');
            setShareStatus('not_shared');
            setShareToken(null);
          }
        })
        .finally(() => {
          if (requestId === currentRequestId) setShareLoading(false);
        });
    },
  );

  const handleCreateShare = async () => {
    const currentConversationId = conversationId();
    if (!currentConversationId) {
      toast.error('No conversation selected');
      return;
    }
    if (pathMessageCount() === 0) {
      toast.warning('There are no messages to share');
      return;
    }

    setShareActionLoading('create');
    try {
      const result = await createConversationShareFn({
        data: { conversationId: currentConversationId, title: conversationTitle() },
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
    const currentConversationId = conversationId();
    if (!currentConversationId) return;

    setShareActionLoading('revoke');
    try {
      await revokeConversationShareFn({ data: { conversationId: currentConversationId } });
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
    const url = shareUrl();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Share URL copied');
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy', error);
      toast.error('Failed to copy share URL');
    }
  };

  const isLoading = () => shareActionLoading() !== null;

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent
        class='flex max-h-[90vh] flex-col overflow-hidden px-6 py-6 sm:max-w-2xl'
        aria-describedby='share-dialog-description'
      >
        <div class='flex min-h-0 flex-1 flex-col gap-6 overflow-hidden'>
          {/* Share URL section */}
          <section class='shrink-0 space-y-3' aria-labelledby='share-url-heading'>
            <h3
              id='share-url-heading'
              class='flex items-center gap-2 text-sm font-medium text-foreground'
            >
              <Link2 class='h-4 w-4 shrink-0 text-muted-foreground' />
              Share link
            </h3>

            {shareLoading() ? (
              <div
                class='flex h-20 items-center gap-2 rounded-lg border border-border bg-muted px-4'
                aria-live='polite'
              >
                <Loader2 class='h-4 w-4 shrink-0 animate-spin text-muted-foreground' />
                <span class='text-sm text-muted-foreground'>Loading…</span>
              </div>
            ) : shareStatus() === 'active' && shareUrl() ? (
              <div class='space-y-3'>
                <div class='flex gap-2'>
                  <div class='min-w-0 flex-1 break-all rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-secondary'>
                    {shareUrl()}
                  </div>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={handleCopyUrl}
                    disabled={isLoading()}
                    aria-label={copied() ? 'Copied' : 'Copy URL'}
                    class='shrink-0'
                  >
                    {copied() ? <Check class='h-4 w-4 text-green-600' /> : <Copy class='h-4 w-4' />}
                    {copied() ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div class='flex items-center gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={handleRevokeShare}
                    disabled={isLoading()}
                    class='text-muted-foreground hover:text-destructive hover:bg-destructive-muted'
                  >
                    {shareActionLoading() === 'revoke' ? (
                      <>
                        <Loader2 class='h-4 w-4 animate-spin' />
                        Revoking…
                      </>
                    ) : (
                      <>
                        <XCircle class='h-4 w-4' />
                        Revoke link
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div class='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <p class='text-sm text-muted-foreground'>
                  {shareStatus() === 'revoked'
                    ? 'Link was revoked. Create a new one to share again.'
                    : 'Anyone with the link can view this conversation.'}
                </p>
                <Button
                  type='button'
                  size='sm'
                  onClick={handleCreateShare}
                  disabled={isLoading() || isBusy() || pathMessageCount() === 0}
                  class='shrink-0'
                >
                  {shareActionLoading() === 'create' ? (
                    <>
                      <Loader2 class='h-4 w-4 animate-spin' />
                      Creating…
                    </>
                  ) : shareStatus() === 'revoked' ? (
                    'Create new link'
                  ) : (
                    'Create link'
                  )}
                </Button>
              </div>
            )}
          </section>
        </div>

        <DialogFooter class='flex shrink-0 flex-row justify-end gap-2 border-t border-border pt-4'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => handleOpenChange(false)}
            class='text-secondary'
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
