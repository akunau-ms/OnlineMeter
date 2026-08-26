import type { MonitorStatus } from "shared-types";
import { inkFor } from "./StatusBot";
import { cn } from "@/lib/utils";

export interface StatusDotProps {
  status: MonitorStatus;
  paused?: boolean;
  className?: string;
}

/**
 * Small static status indicator for list contexts (sidebar rows) where
 * mounting one animated StatusBot per row would mean one rAF loop per row
 * for no perceptible benefit at that size — see research.md decision 5.
 * Reuses StatusBot's own status→color mapping so the two never drift.
 */
export function StatusDot({ status, paused = false, className }: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={paused ? "paused" : status}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: inkFor(status, paused) }}
    />
  );
}
