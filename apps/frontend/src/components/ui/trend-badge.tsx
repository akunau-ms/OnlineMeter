import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendBadgeProps {
  /** Signed percentage-point (or similar) change. Sign drives arrow direction and color. */
  value: number;
  className?: string;
}

/** Small ↗/↘ percentage pill for dashboard stat cards, in the spirit of the reference layout. */
export function TrendBadge({ value, className }: TrendBadgeProps) {
  const isUp = value >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium",
        isUp ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {isUp ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
