import { Badge } from "@/components/ui/badge";
import type { ClassStatus } from "@/lib/classes-api";
import { CheckCircle2, Clock3, FileEdit } from "lucide-react";

const META: Record<ClassStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  draft: {
    label: "Draft",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: FileEdit,
  },
  "in-review": {
    label: "In review",
    cls: "border-amber-400/40 bg-amber-100/60 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    Icon: Clock3,
  },
  published: {
    label: "Published",
    cls: "border-success/30 bg-success/10 text-success",
    Icon: CheckCircle2,
  },
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const key = (["draft", "in-review", "published"].includes(status) ? status : "draft") as ClassStatus;
  const { label, cls, Icon } = META[key];
  return (
    <Badge
      variant="outline"
      className={`gap-1 rounded-md text-[10px] font-medium ${cls} ${className}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}
