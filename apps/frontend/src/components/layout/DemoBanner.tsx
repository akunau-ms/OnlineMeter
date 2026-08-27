import { Radio } from "lucide-react";
import { useConfig } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { strings } from "@/strings";

/**
 * Persistent strip shown only when this instance is a read-only demo
 * (specs/021 FR-003) — so a visitor never wonders whether a disabled
 * control is broken or intentional.
 */
export function DemoBanner() {
  const { data: config } = useConfig();
  if (!config?.demoMode) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      <Badge variant="outline" className="gap-1">
        <Radio className="h-3 w-3" />
        {strings.demo.bannerTitle}
      </Badge>
      <span>{strings.demo.bannerBody}</span>
    </div>
  );
}
