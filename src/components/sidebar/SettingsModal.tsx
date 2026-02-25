
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { theme, toggleTheme } = useTheme();

  const handleThemeToggle = () => {
    toggleTheme();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[50vh] w-[50vw] min-w-[320px] max-w-4xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="flex h-[calc(100%-3rem)] flex-col justify-between">
          <div className="space-y-6">
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
          </div>
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
