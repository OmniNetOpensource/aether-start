import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Ban, Gift, Loader2, LogOut, Plus } from "lucide-react";
import { authClient } from "@/features/auth/client/auth-client";
import { getSessionStateFn } from "@/features/auth/server/session-state";
import { resetLastEventId } from "@/features/chat/lib/api/chat-orchestrator";
import { useChatRequestStore } from "@/features/chat/store/useChatRequestStore";
import { useComposerStore } from "@/features/chat/store/useComposerStore";
import { useEditingStore } from "@/features/chat/store/useEditingStore";
import { useNotesStore } from "@/features/notes/store/useNotesStore";
import { useChatSessionStore } from "@/features/sidebar/store/useChatSessionStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/useToast";
import {
  adminCreateRedeemCodeFn,
  adminDeactivateRedeemCodeFn,
  adminListRedeemCodesFn,
} from "@/server/functions/admin/redeem-codes";
import { getQuotaFn, redeemCodeFn } from "@/server/functions/quota";

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

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCodes, setAdminCodes] = useState<AdminCode[]>([]);
  const [adminCodesLoading, setAdminCodesLoading] = useState(false);
  const [createCode, setCreateCode] = useState({ code: "", amount: 50 });
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const load = async () => {
      setQuotaLoading(true);
      try {
        const [quotaRes, sessionRes] = await Promise.all([
          getQuotaFn(),
          getSessionStateFn(),
        ]);
        setBalance(quotaRes.balance);
        setIsAdmin(sessionRes.isAdmin ?? false);
      } catch {
        setBalance(0);
      } finally {
        setQuotaLoading(false);
      }
    };

    void load();
  }, [open]);

  useEffect(() => {
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
  }, [open, isAdmin]);

  const reloadAdminCodes = async () => {
    const res = await adminListRedeemCodesFn({
      data: { limit: 20, cursor: null },
    });
    setAdminCodes(res.items);
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      useChatRequestStore.getState().setStatus("idle");
      useComposerStore.getState().clear();
      useEditingStore.getState().clear();
      useChatSessionStore.getState().clearSession();
      useChatSessionStore.getState().resetConversations();
      useNotesStore.getState().reset();
      resetLastEventId();
      await navigate({ href: "/auth/login", replace: true });
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
      setBalance(res.balance);
      setRedeemCode("");
      toast.success(`Redeemed successfully. Added ${res.added} credits.`);
      if (isAdmin) {
        await reloadAdminCodes();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Redeem failed");
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleCreateCode = async () => {
    const { code, amount } = createCode;
    if (!code.trim() || amount < 1 || createLoading) {
      return;
    }

    setCreateLoading(true);
    try {
      await adminCreateRedeemCodeFn({
        data: { code: code.trim().toUpperCase(), amount, expiresAt: null },
      });
      setCreateCode({ code: "", amount: 50 });
      toast.success("Redeem code created");
      await reloadAdminCodes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await adminDeactivateRedeemCodeFn({ data: { id } });
      toast.success("Code deactivated");
      await reloadAdminCodes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[50vw] min-w-[320px] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Quota</h3>
            <div className="space-y-3 rounded-lg border bg-(--surface-muted) p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Remaining credits
                </span>
                <span className="text-lg font-semibold">
                  {quotaLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    `${balance ?? 0} credits`
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter redeem code"
                  value={redeemCode}
                  onChange={(event) => setRedeemCode(event.target.value)}
                  disabled={redeemLoading}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleRedeem}
                  disabled={!redeemCode.trim() || redeemLoading}
                >
                  {redeemLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Gift className="mr-1 h-4 w-4" />
                      Redeem
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Account
            </h3>
            <div className="rounded-lg border bg-(--surface-muted) p-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-destructive hover:bg-(--status-destructive-muted) hover:text-destructive"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                {isSigningOut ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </div>

          {isAdmin ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Redeem Codes
              </h3>
              <div className="space-y-3 rounded-lg border bg-(--surface-muted) p-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Code"
                    value={createCode.code}
                    onChange={(event) =>
                      setCreateCode((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                    disabled={createLoading}
                    className="w-32"
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Amount"
                    value={createCode.amount || ""}
                    onChange={(event) =>
                      setCreateCode((current) => ({
                        ...current,
                        amount: parseInt(event.target.value, 10) || 0,
                      }))
                    }
                    disabled={createLoading}
                    className="w-20"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateCode}
                    disabled={
                      !createCode.code.trim() ||
                      createCode.amount < 1 ||
                      createLoading
                    }
                  >
                    {createLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mr-1 h-4 w-4" />
                        Create
                      </>
                    )}
                  </Button>
                </div>

                <div className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {adminCodesLoading ? (
                    <span>Loading...</span>
                  ) : adminCodes.length === 0 ? (
                    <span>No redeem codes yet.</span>
                  ) : (
                    adminCodes.map((code) => (
                      <div
                        key={code.id}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        <span>
                          <code className="rounded bg-muted px-1">
                            {code.code}
                          </code>{" "}
                          +{code.amount} credits
                          {code.used_at ? (
                            <span className="ml-1 text-muted-foreground">
                              used
                            </span>
                          ) : code.is_active ? (
                            <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                              active
                            </span>
                          ) : (
                            <span className="ml-1 text-muted-foreground">
                              inactive
                            </span>
                          )}
                        </span>
                        {!code.used_at && code.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 text-destructive"
                            onClick={() => handleDeactivate(code.id)}
                          >
                            <Ban className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="self-start"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
