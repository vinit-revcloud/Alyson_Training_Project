import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function QueryLoadError({
  message = "Failed to load data",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">{message}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
