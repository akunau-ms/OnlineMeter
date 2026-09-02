import * as React from "react";
import type { TriggerType } from "shared-types";
import {
  TRIGGER_APPLICABLE_MONITOR_TYPES,
  TRIGGER_TYPES_WITH_THRESHOLD,
} from "shared-types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAddWidget, useConfig, useMonitors } from "@/services/api";
import { strings } from "@/strings";

const ALL_TRIGGER_TYPES = Object.keys(TRIGGER_APPLICABLE_MONITOR_TYPES) as TriggerType[];

/**
 * Starting points, not enforced minimums/maximums — a person can always
 * type over any of these (spec.md Assumptions, research.md decision 1:
 * kept local to this component, not `shared-types`, since the backend
 * never needs to know what a "good" default looks like).
 */
const TRIGGER_DEFAULT_THRESHOLDS: Partial<
  Record<TriggerType, { warning?: number; critical?: number }>
> = {
  down_duration_minutes: { warning: 5, critical: 30 },
  response_time_ms: { warning: 500, critical: 2000 },
  certificate_expiry_days: { warning: 30, critical: 7 },
  uptime_below_percent: { warning: 99, critical: 95 },
};

export interface AddWidgetDialogProps {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddWidgetDialog({ dashboardId, open, onOpenChange }: AddWidgetDialogProps) {
  const { data: monitors } = useMonitors();
  const addWidget = useAddWidget();
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;
  const [monitorId, setMonitorId] = React.useState<string>("");
  const [triggerType, setTriggerType] = React.useState<TriggerType | "">("");
  const [warningThreshold, setWarningThreshold] = React.useState<string>("");
  const [criticalThreshold, setCriticalThreshold] = React.useState<string>("");

  const selectedMonitor = monitors?.find((m) => m.id === monitorId);
  const applicableTriggerTypes = selectedMonitor
    ? ALL_TRIGGER_TYPES.filter((t) => {
        const applicable = TRIGGER_APPLICABLE_MONITOR_TYPES[t];
        return applicable === "all" || applicable.includes(selectedMonitor.type);
      })
    : [];
  const needsThreshold = triggerType ? TRIGGER_TYPES_WITH_THRESHOLD.includes(triggerType) : false;

  function reset() {
    setMonitorId("");
    setTriggerType("");
    setWarningThreshold("");
    setCriticalThreshold("");
  }

  function selectTriggerType(t: TriggerType) {
    setTriggerType(t);
    const defaults = TRIGGER_DEFAULT_THRESHOLDS[t];
    setWarningThreshold(defaults?.warning !== undefined ? String(defaults.warning) : "");
    setCriticalThreshold(defaults?.critical !== undefined ? String(defaults.critical) : "");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!monitorId || !triggerType) return;
    await addWidget.mutateAsync({
      dashboardId,
      monitorId,
      triggerType,
      warningThreshold: needsThreshold && warningThreshold !== "" ? Number(warningThreshold) : null,
      criticalThreshold:
        needsThreshold && criticalThreshold !== "" ? Number(criticalThreshold) : null,
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.dashboards.addWidgetDialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-monitor">{strings.dashboards.monitorLabel}</Label>
            <Select
              value={monitorId}
              onValueChange={(value) => {
                setMonitorId(value);
                setTriggerType("");
              }}
            >
              <SelectTrigger id="widget-monitor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monitors?.map((monitor) => (
                  <SelectItem key={monitor.id} value={monitor.id}>
                    {monitor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-trigger">{strings.dashboards.triggerLabel}</Label>
            <Select
              value={triggerType}
              onValueChange={(value) => selectTriggerType(value as TriggerType)}
              disabled={!monitorId}
            >
              <SelectTrigger id="widget-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {applicableTriggerTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {strings.dashboards.trigger[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {triggerType ? (
              <p className="text-xs text-muted-foreground">
                {strings.dashboards.triggerDescription[triggerType]}
              </p>
            ) : null}
          </div>

          {needsThreshold ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-warning-threshold">
                  {strings.dashboards.warningThresholdLabel}
                </Label>
                <Input
                  id="widget-warning-threshold"
                  type="number"
                  min={1}
                  placeholder="—"
                  value={warningThreshold}
                  onChange={(e) => setWarningThreshold(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-critical-threshold">
                  {strings.dashboards.criticalThresholdLabel}
                </Label>
                <Input
                  id="widget-critical-threshold"
                  type="number"
                  min={1}
                  placeholder="—"
                  value={criticalThreshold}
                  onChange={(e) => setCriticalThreshold(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="submit"
              disabled={!monitorId || !triggerType || addWidget.isPending || demoMode}
              title={demoMode ? strings.demo.disabledTitle : undefined}
            >
              {strings.dashboards.addWidget}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
