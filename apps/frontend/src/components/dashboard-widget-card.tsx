import type { DashboardWidgetView } from "shared-types";
import { AlertTriangle, CheckCircle2, PauseCircle, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonitorHistoryStrip } from "@/components/layout/MonitorHistoryStrip";
import { useConfig } from "@/services/api";
import { strings } from "@/strings";
import { cn } from "@/lib/utils";

export interface DashboardWidgetCardProps {
  widget: DashboardWidgetView;
  onRemove: () => void;
}

/**
 * Reuses the app's existing status-badge visual language (success/warning/
 * destructive/muted) rather than inventing a new one, per Component & UI
 * Standards — "critical"/"warning"/"normal" (specs/028) and "paused"
 * (specs/027 FR-012) are the only four states a widget can be in.
 */
export function DashboardWidgetCard({ widget, onRemove }: DashboardWidgetCardProps) {
  const paused = !widget.monitor.active;
  const triggerLabel = strings.dashboards.trigger[widget.triggerType];
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;
  const threshold =
    widget.criticalThreshold !== null
      ? widget.criticalThreshold
      : (widget.warningThreshold ?? null);

  return (
    <Card
      className={cn(
        !paused && widget.severity === "critical" && "border-destructive/60",
        !paused && widget.severity === "warning" && "border-warning/60",
      )}
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm font-semibold">{widget.monitor.name}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            {triggerLabel}
            {threshold !== null ? `: ${threshold}` : ""}
          </p>
        </div>
        {paused ? (
          <Badge variant="status-muted" className="gap-1">
            <PauseCircle className="h-3 w-3" />
            {strings.dashboards.paused}
          </Badge>
        ) : widget.severity === "critical" ? (
          <Badge variant="status-destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {strings.dashboards.problem}
          </Badge>
        ) : widget.severity === "warning" ? (
          <Badge variant="status-warning" className="gap-1">
            <TriangleAlert className="h-3 w-3" />
            {strings.dashboards.warning}
          </Badge>
        ) : (
          <Badge variant="status-success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {strings.dashboards.normal}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <MonitorHistoryStrip recentHeartbeats={widget.monitor.recentHeartbeats} />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={demoMode}
            title={demoMode ? strings.demo.disabledTitle : undefined}
            onClick={onRemove}
          >
            {strings.dashboards.removeWidget}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
