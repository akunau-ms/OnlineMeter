import * as React from "react";
import { CheckCircle2, CircleDashed, PauseCircle, XCircle } from "lucide-react";
import type { MonitorStatus } from "shared-types";
import { Badge } from "@/components/ui/badge";
import { strings } from "@/strings";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  status: MonitorStatus;
  paused?: boolean;
  /** Overrides the default status label (e.g. StatCard's own "Healthy"/"Attention" copy). */
  label?: React.ReactNode;
  className?: string;
}

const STATUS_ICON: Record<"up" | "down" | "pending" | "paused", typeof CheckCircle2> = {
  up: CheckCircle2,
  down: XCircle,
  pending: CircleDashed,
  paused: PauseCircle,
};

const STATUS_VARIANT: Record<
  "up" | "down" | "pending" | "paused",
  "status-success" | "status-destructive" | "status-outline" | "status-muted"
> = {
  up: "status-success",
  down: "status-destructive",
  pending: "status-outline",
  paused: "status-muted",
};

/** Icon + label status pill, in the spirit of the shadcn dashboard-01 reference. */
export function StatusBadge({ status, paused = false, label, className }: StatusBadgeProps) {
  const key = paused ? "paused" : status;
  const Icon = STATUS_ICON[key];
  return (
    <Badge variant={STATUS_VARIANT[key]} className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" />
      {label ?? (paused ? strings.status.paused : strings.status[status])}
    </Badge>
  );
}
