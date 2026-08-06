import { createEffect, createSignal, For } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { Ban, Gift, Loader2, LogOut, Plus } from '@/frontend/design-system/icons';
import { authClient } from '@/frontend/auth/client';
import { getSessionStateFn } from '@/rpc/auth';
import { resetLastEventId } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatRuntime } from '@/frontend/chat/agent-runtime/chat-runtime';
import { clearArtifacts } from '@/frontend/chat/artifact/artifact-state';
import { clearMessageTree } from '@/frontend/conversations/conversation-tree/message-tree-state';
import { clearConversationMeta } from '@/frontend/conversations/session/conversation-meta';
import { conversationListQueryKey, queryClient } from '@/frontend/conversations/session';
import { Button } from '@/frontend/design-system/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/design-system/dialog';
import { Input } from '@/frontend/design-system/input';
import { useToast } from '@/frontend/app-shell/useToast';
import {
  adminCreateRedeemCodeFn,
  adminDeactivateRedeemCodeFn,
  adminListRedeemCodesFn,
} from '@/rpc/redeem-codes';
import { getQuotaFn, redeemCodeFn } from '@/rpc/quota';

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AdminCode = {
  id: string;
  code: string;
  amount: number;
  is_active: boolean;
  used_at: string | null;
  created_at: string;
};

export function SettingsModal(props: SettingsModalProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [balance, setBalance] = createSignal<number | null>(null);
  const [isSigningOut, setIsSigningOut] = createSignal(false);
  const [quotaLoading, setQuotaLoading] = createSignal(false);
  const [redeemCode, setRedeemCode] = createSignal('');
  const [redeemLoading, setRedeemLoading] = createSignal(false);
  const [isAdmin, setIsAdmin] = createSignal(false);
  const [adminCodes, setAdminCodes] = createSignal<AdminCode[]>([]);
  const [adminCodesLoading, setAdminCodesLoading] = createSignal(false);
  const [createCode, setCreateCode] = createSignal({ code: '', amount: 50 });
  const [createLoading, setCreateLoading] = createSignal(false);

  createEffect(
    () => props.open,
    (open) => {
      if (!open) {
        return;
      }

      const load = async () => {
        setQuotaLoading(true);
        try {
          const [quotaRes, sessionRes] = await Promise.all([getQuotaFn(), getSessionStateFn()]);
          setBalance(quotaRes.balance);
          setIsAdmin(sessionRes.isAdmin ?? false);
        } catch {
          setBalance(0);
        } finally {
          setQuotaLoading(false);
        }
      };

      void load();
    },
  );

  createEffect(
    () => ({ open: props.open, isAdmin: isAdmin() }),
    ({ open, isAdmin }) => {
      if (!open || !isAdmin) {
        return;
      }

      const loadCodes = async () => {
        setAdminCodesLoading(true);
        try {
          const res = await adminListRedeemCodesFn({
            data: { limit: 20, cursor: null },
          });
          setAdminCodes(res.items);
        } catch {
          setAdminCodes([]);
        } finally {
          setAdminCodesLoading(false);
        }
      };

      void loadCodes();
    },
  );

  const reloadAdminCodes = async () => {
    const res = await adminListRedeemCodesFn({
      data: { limit: 20, cursor: null },
    });
    setAdminCodes(res.items);
  };

  const handleSignOut = async () => {
    if (isSigningOut()) {
      return;
    }

    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      chatRuntime.setStatus('idle');
      clearConversationMeta();
      clearMessageTree();
      clearArtifacts();
      queryClient.removeQueries({ queryKey: conversationListQueryKey });
      resetLastEventId();
      await navigate({ href: '/auth/login', replace: true });
      setIsSigningOut(false);
    }
  };

  const handleRedeem = async () => {
    const code = redeemCode().trim();
    if (!code || redeemLoading()) {
      return;
    }

    setRedeemLoading(true);
    try {
      const res = await redeemCodeFn({ data: { code } });
      setBalance(res.balance);
      setRedeemCode('');
      toast.success(`Redeemed successfully. Added ${res.added} credits.`);
      if (isAdmin()) {
        await reloadAdminCodes();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Redeem failed');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleCreateCode = async () => {
    const { code, amount } = createCode();
    if (!code.trim() || amount < 1 || createLoading()) {
      return;
    }

    setCreateLoading(true);
    try {
      await adminCreateRedeemCodeFn({
        data: { code: code.trim().toUpperCase(), amount, expiresAt: null },
      });
      setCreateCode({ code: '', amount: 50 });
      toast.success('Redeem code created');
      await reloadAdminCodes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Create failed');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await adminDeactivateRedeemCodeFn({ data: { id } });
      toast.success('Code deactivated');
      await reloadAdminCodes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class='max-h-[85vh] w-[50vw] min-w-[320px] max-w-4xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div class='flex flex-col gap-6'>
          <div class='space-y-3'>
            <h3 class='text-sm font-medium text-muted-foreground'>Quota</h3>
            <div class='space-y-3 rounded-lg border bg-muted p-3'>
              <div class='flex items-center justify-between'>
                <span class='text-sm text-muted-foreground'>Remaining credits</span>
                <span class='text-lg font-semibold'>
                  {quotaLoading() ? (
                    <Loader2 class='h-5 w-5 animate-spin' />
                  ) : (
                    `${balance() ?? 0} credits`
                  )}
                </span>
              </div>
              <div class='flex gap-2'>
                <Input
                  placeholder='Enter redeem code'
                  value={redeemCode()}
                  onChange={(event) => setRedeemCode(event.currentTarget.value)}
                  disabled={redeemLoading()}
                  class='flex-1'
                />
                <Button
                  size='sm'
                  onClick={handleRedeem}
                  disabled={!redeemCode().trim() || redeemLoading()}
                >
                  {redeemLoading() ? (
                    <Loader2 class='h-4 w-4 animate-spin' />
                  ) : (
                    <>
                      <Gift class='mr-1 h-4 w-4' />
                      Redeem
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div class='space-y-3'>
            <h3 class='text-sm font-medium text-muted-foreground'>Account</h3>
            <div class='rounded-lg border bg-muted p-3'>
              <Button
                variant='outline'
                class='w-full justify-start gap-2 text-destructive hover:bg-destructive-muted hover:text-destructive'
                onClick={handleSignOut}
                disabled={isSigningOut()}
              >
                {isSigningOut() ? (
                  <Loader2 class='h-4 w-4 animate-spin' />
                ) : (
                  <LogOut class='h-4 w-4' />
                )}
                {isSigningOut() ? 'Signing out...' : 'Sign out'}
              </Button>
            </div>
          </div>

          {isAdmin() ? (
            <div class='space-y-3'>
              <h3 class='text-sm font-medium text-muted-foreground'>Redeem Codes</h3>
              <div class='space-y-3 rounded-lg border bg-muted p-3'>
                <div class='flex gap-2'>
                  <Input
                    placeholder='Code'
                    value={createCode().code}
                    onChange={(event) =>
                      setCreateCode((current) => ({
                        ...current,
                        code: event.currentTarget.value,
                      }))
                    }
                    disabled={createLoading()}
                    class='w-32'
                  />
                  <Input
                    type='number'
                    min={1}
                    placeholder='Amount'
                    value={createCode().amount || ''}
                    onChange={(event) =>
                      setCreateCode((current) => ({
                        ...current,
                        amount: parseInt(event.currentTarget.value, 10) || 0,
                      }))
                    }
                    disabled={createLoading()}
                    class='w-20'
                  />
                  <Button
                    size='sm'
                    onClick={handleCreateCode}
                    disabled={
                      !createCode().code.trim() || createCode().amount < 1 || createLoading()
                    }
                  >
                    {createLoading() ? (
                      <Loader2 class='h-4 w-4 animate-spin' />
                    ) : (
                      <>
                        <Plus class='mr-1 h-4 w-4' />
                        Create
                      </>
                    )}
                  </Button>
                </div>

                <div class='max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground'>
                  {adminCodesLoading() ? (
                    <span>Loading...</span>
                  ) : adminCodes().length === 0 ? (
                    <span>No redeem codes yet.</span>
                  ) : (
                    <For each={adminCodes()}>
                      {(code) => (
                        <div class='flex items-center justify-between gap-2 py-1'>
                          <span>
                            <code class='rounded bg-muted px-1'>{code.code}</code> +{code.amount}{' '}
                            credits
                            {code.used_at ? (
                              <span class='ml-1 text-muted-foreground'>used</span>
                            ) : code.is_active ? (
                              <span class='ml-1 text-success'>active</span>
                            ) : (
                              <span class='ml-1 text-muted-foreground'>inactive</span>
                            )}
                          </span>
                          {!code.used_at && code.is_active ? (
                            <Button
                              variant='ghost'
                              size='sm'
                              class='h-6 px-1 text-destructive'
                              onClick={() => handleDeactivate(code.id)}
                            >
                              <Ban class='h-3 w-3' />
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </For>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div class='flex gap-3'>
            <Button variant='outline' onClick={() => props.onOpenChange(false)} class='self-start'>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
