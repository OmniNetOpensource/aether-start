import { useEffect, useState } from "react";
import { Moon, Sun, Gift, Loader2, Plus, Ban } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "@/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getQuotaFn, redeemCodeFn } from "@/server/functions/quota";
import { getSessionStateFn } from "@/server/functions/auth/session-state";
import {
  adminListRedeemCodesFn,
  adminCreateRedeemCodeFn,
  adminDeactivateRedeemCodeFn,
} from "@/server/functions/admin/redeem-codes";

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { theme, toggleTheme } = useTheme();
  const [balance, setBalance] = useState<number | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCodes, setAdminCodes] = useState<
    Array<{
      id: string;
      code: string;
      amount: number;
      is_active: boolean;
      used_at: string | null;
      created_at: string;
    }>
  >([]);
  const [adminCodesLoading, setAdminCodesLoading] = useState(false);
  const [createCode, setCreateCode] = useState({ code: "", amount: 50 });
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

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
    if (!open || !isAdmin) return;

    const loadCodes = async () => {
      setAdminCodesLoading(true);
      try {
        const res = await adminListRedeemCodesFn({ data: { limit: 20, cursor: null } });
        setAdminCodes(res.items);
      } catch {
        setAdminCodes([]);
      } finally {
        setAdminCodesLoading(false);
      }
    };
    void loadCodes();
  }, [open, isAdmin]);

  const handleThemeToggle = () => {
    toggleTheme();
  };

  const handleRedeem = async () => {
    const code = redeemCode.trim();
    if (!code || redeemLoading) return;

    setRedeemLoading(true);
    try {
      const res = await redeemCodeFn({ data: { code } });
      setBalance(res.balance);
      setRedeemCode("");
      toast.success(`兑换成功，获得 ${res.added} 条额度`);
      if (isAdmin) {
        const listRes = await adminListRedeemCodesFn({ data: { limit: 20, cursor: null } });
        setAdminCodes(listRes.items);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "兑换失败");
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleCreateCode = async () => {
    const { code, amount } = createCode;
    if (!code.trim() || amount < 1 || createLoading) return;

    setCreateLoading(true);
    try {
      await adminCreateRedeemCodeFn({
        data: { code: code.trim().toUpperCase(), amount, expiresAt: null },
      });
      setCreateCode({ code: "", amount: 50 });
      toast.success("兑换码已创建");
      const res = await adminListRedeemCodesFn({ data: { limit: 20, cursor: null } });
      setAdminCodes(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await adminDeactivateRedeemCodeFn({ data: { id } });
      toast.success("已停用");
      const res = await adminListRedeemCodesFn({ data: { limit: 20, cursor: null } });
      setAdminCodes(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[50vw] min-w-[320px] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Quota Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Prompt 额度
            </h3>
            <div className="rounded-lg border bg-(--surface-muted)/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">剩余额度</span>
                <span className="text-lg font-semibold">
                  {quotaLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    `${balance ?? 0} 条`
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="输入兑换码"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
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
                      <Gift className="h-4 w-4 mr-1" />
                      兑换
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              外观
            </h3>
            <div className="flex items-center justify-between rounded-lg border bg-(--surface-muted)/30 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-foreground shadow-sm ring-1 ring-border">
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    深色模式
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {theme === "dark" ? "已开启" : "已关闭"}
                  </span>
                </div>
              </div>
              <Switch
                checked={theme === "dark"}
                onClick={handleThemeToggle}
              />
            </div>
          </div>

          {/* Admin: Redeem Code Management */}
          {isAdmin && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                兑换码管理
              </h3>
              <div className="rounded-lg border bg-(--surface-muted)/30 p-3 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="兑换码"
                    value={createCode.code}
                    onChange={(e) =>
                      setCreateCode((c) => ({ ...c, code: e.target.value }))
                    }
                    disabled={createLoading}
                    className="w-32"
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="条数"
                    value={createCode.amount || ""}
                    onChange={(e) =>
                      setCreateCode((c) => ({
                        ...c,
                        amount: parseInt(e.target.value, 10) || 0,
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
                        <Plus className="h-4 w-4 mr-1" />
                        创建
                      </>
                    )}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-1">
                  {adminCodesLoading ? (
                    <span>加载中...</span>
                  ) : adminCodes.length === 0 ? (
                    <span>暂无兑换码</span>
                  ) : (
                    adminCodes.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        <span>
                          <code className="bg-muted px-1 rounded">{c.code}</code>{" "}
                          +{c.amount} 条
                          {c.used_at ? (
                            <span className="text-muted-foreground ml-1">已使用</span>
                          ) : c.is_active ? (
                            <span className="text-emerald-600 dark:text-emerald-400 ml-1">有效</span>
                          ) : (
                            <span className="text-muted-foreground ml-1">已停用</span>
                          )}
                        </span>
                        {!c.used_at && c.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 text-destructive"
                            onClick={() => handleDeactivate(c.id)}
                          >
                            <Ban className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="self-start"
            >
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
