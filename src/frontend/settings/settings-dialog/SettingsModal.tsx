import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Ban, Gift, Loader2, LogOut, Plus } from '@/frontend/design-system/icons';
import { authClient } from '@/frontend/auth/client';
import { getSessionStateFn } from '@/rpc/auth';
import { resetLastEventId } from '@/frontend/chat/agent-runtime/event-handlers';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
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

export function SettingsModal(props: SettingsModalProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newAmount, setNewAmount] = useState(50);
  const [createLoading, setCreateLoading] = useState(false);

  const balanceQuery = useQuery({
    queryKey: ['settings', 'quota'],
    queryFn: () => getQuotaFn(),
    enabled: props.open,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
    gcTime: 0,
  });
  const sessionQuery = useQuery({
    queryKey: ['settings', 'session'],
    queryFn: () => getSessionStateFn(),
    enabled: props.open,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
    gcTime: 0,
  });
  const isAdmin = sessionQuery.data?.isAdmin ?? false;
  const adminCodesQuery = useQuery({
    queryKey: ['settings', 'redeem-codes'],
    queryFn: () => adminListRedeemCodesFn({ data: { limit: 20, cursor: null } }),
    enabled: props.open && isAdmin,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
    gcTime: 0,
  });

  if (balanceQuery.error) throw balanceQuery.error;
  if (sessionQuery.error) throw sessionQuery.error;
  if (adminCodesQuery.error) throw adminCodesQuery.error;

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      chatState.setStatus('idle');
      clearConversationMeta();
      clearMessageTree();
      clearArtifacts();
      queryClient.removeQueries({ queryKey: conversationListQueryKey });
      resetLastEventId();
      await navigate({
        to: '/auth/login',
        search: { redirect: undefined, email: undefined, reset: undefined },
        replace: true,
      });
      setIsSigningOut(false);
    }
  };

  const handleRedeem = async () => {
    const code = redeemCode.trim();
    if (!code || redeemLoading) {
      return;
    }

    setRedeemLoading(true);
    try {
      const res = await redeemCodeFn({ data: { code } });
      queryClient.setQueryData(['settings', 'quota'], { balance: res.balance });
      setRedeemCode('');
      toast.success(`Redeemed successfully. Added ${res.added} credits.`);
      if (isAdmin) {
        await queryClient.invalidateQueries({ queryKey: ['settings', 'redeem-codes'] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Redeem failed');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleCreateCode = async () => {
    const code = newCode;
    const amount = newAmount;
    if (!code.trim() || amount < 1 || createLoading) {
      return;
    }

    setCreateLoading(true);
    try {
      await adminCreateRedeemCodeFn({
        data: { code: code.trim().toUpperCase(), amount, expiresAt: null },
      });
      setNewCode('');
      setNewAmount(50);
      toast.success('Redeem code created');
      await queryClient.invalidateQueries({ queryKey: ['settings', 'redeem-codes'] });
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
      await queryClient.invalidateQueries({ queryKey: ['settings', 'redeem-codes'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[85vh] w-[50vw] min-w-[320px] max-w-4xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className='flex flex-col gap-6'>
          <div className='space-y-3'>
            <h3 className='text-sm font-medium text-muted-foreground'>Quota</h3>
            <div className='space-y-3 rounded-lg border bg-muted p-3'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-muted-foreground'>Remaining credits</span>
                <span className='text-lg font-semibold'>
                  {balanceQuery.isLoading ? (
                    <Loader2 className='h-5 w-5 animate-spin' />
                  ) : balanceQuery.data ? (
                    `${balanceQuery.data.balance} credits`
                  ) : null}
                </span>
              </div>
              <div className='flex gap-2'>
                <Input
                  placeholder='Enter redeem code'
                  value={redeemCode}
                  onChange={(event) => setRedeemCode(event.currentTarget.value)}
                  disabled={redeemLoading}
                  className='flex-1'
                />
                <Button
                  size='sm'
                  onClick={handleRedeem}
                  disabled={!redeemCode.trim() || redeemLoading}
                >
                  {redeemLoading ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <>
                      <Gift className='mr-1 h-4 w-4' />
                      Redeem
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className='space-y-3'>
            <h3 className='text-sm font-medium text-muted-foreground'>Account</h3>
            <div className='rounded-lg border bg-muted p-3'>
              <Button
                variant='outline'
                className='w-full justify-start gap-2 text-destructive hover:bg-destructive-muted hover:text-destructive'
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <LogOut className='h-4 w-4' />
                )}
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </Button>
            </div>
          </div>

          {isAdmin ? (
            <div className='space-y-3'>
              <h3 className='text-sm font-medium text-muted-foreground'>Redeem Codes</h3>
              <div className='space-y-3 rounded-lg border bg-muted p-3'>
                <div className='flex gap-2'>
                  <Input
                    placeholder='Code'
                    value={newCode}
                    onChange={(event) => setNewCode(event.currentTarget.value)}
                    disabled={createLoading}
                    className='w-32'
                  />
                  <Input
                    type='number'
                    min={1}
                    placeholder='Amount'
                    value={newAmount || ''}
                    onChange={(event) => setNewAmount(parseInt(event.currentTarget.value, 10) || 0)}
                    disabled={createLoading}
                    className='w-20'
                  />
                  <Button
                    size='sm'
                    onClick={handleCreateCode}
                    disabled={!newCode.trim() || newAmount < 1 || createLoading}
                  >
                    {createLoading ? (
                      <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                      <>
                        <Plus className='mr-1 h-4 w-4' />
                        Create
                      </>
                    )}
                  </Button>
                </div>

                <div className='max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground'>
                  {adminCodesQuery.isLoading ? (
                    <span>Loading...</span>
                  ) : adminCodesQuery.data?.items.length === 0 ? (
                    <span>No redeem codes yet.</span>
                  ) : (
                    adminCodesQuery.data?.items.map((code) => (
                      <div key={code.id} className='flex items-center justify-between gap-2 py-1'>
                        <span>
                          <code className='rounded bg-muted px-1'>{code.code}</code> +{code.amount}{' '}
                          credits
                          {code.used_at ? (
                            <span className='ml-1 text-muted-foreground'>used</span>
                          ) : code.is_active ? (
                            <span className='ml-1 text-success'>active</span>
                          ) : (
                            <span className='ml-1 text-muted-foreground'>inactive</span>
                          )}
                        </span>
                        {!code.used_at && code.is_active ? (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-6 px-1 text-destructive'
                            onClick={() => handleDeactivate(code.id)}
                          >
                            <Ban className='h-3 w-3' />
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className='flex gap-3'>
            <Button
              variant='outline'
              onClick={() => props.onOpenChange(false)}
              className='self-start'
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
