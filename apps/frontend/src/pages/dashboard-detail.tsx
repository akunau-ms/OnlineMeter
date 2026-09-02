import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { DashboardWidgetCard } from "@/components/dashboard-widget-card";
import { AddWidgetDialog } from "@/components/add-widget-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useConfig,
  useDashboard,
  useDeleteDashboard,
  useRemoveWidget,
  useRenameDashboard,
} from "@/services/api";
import { useRealtimeMonitors } from "@/services/realtime";
import { strings } from "@/strings";

export function DashboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dashboard, isLoading, refetch } = useDashboard(id);
  const removeWidget = useRemoveWidget();
  const renameDashboard = useRenameDashboard();
  const deleteDashboard = useDeleteDashboard();
  const { statusById, lastHeartbeats } = useRealtimeMonitors();
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;

  const [addWidgetOpen, setAddWidgetOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const widgetMonitorIds = React.useMemo(
    () => new Set((dashboard?.widgets ?? []).map((w) => w.monitor.id)),
    [dashboard],
  );

  // Refetch this dashboard whenever a live status/heartbeat event arrives
  // for one of its own widgets' monitors — the 30s refetchInterval on
  // useDashboard is only the backstop for the one trigger type that can
  // change with no new event at all (research.md decision 3).
  React.useEffect(() => {
    if (widgetMonitorIds.size === 0) return;
    const changedIds = [...Object.keys(statusById), ...Object.keys(lastHeartbeats)];
    if (changedIds.some((monitorId) => widgetMonitorIds.has(monitorId))) {
      void refetch();
    }
    // Deliberately keyed on the realtime patches, not `refetch`/`widgetMonitorIds`
    // themselves — this only needs to react to new live data arriving.
  }, [statusById, lastHeartbeats]);

  if (isLoading || !dashboard) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">{strings.dashboard.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        {renaming && !demoMode ? (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await renameDashboard.mutateAsync({ id: dashboard.id, name: name.trim() });
              setRenaming(false);
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-56"
            />
            <Button type="submit" size="sm" disabled={renameDashboard.isPending}>
              {strings.dashboards.rename}
            </Button>
          </form>
        ) : (
          <h1 className="text-lg font-semibold">{dashboard.name}</h1>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={demoMode}
            title={demoMode ? strings.demo.disabledTitle : undefined}
            onClick={() => setAddWidgetOpen(true)}
          >
            {strings.dashboards.addWidget}
          </Button>
          {!renaming ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={demoMode}
              title={demoMode ? strings.demo.disabledTitle : undefined}
              onClick={() => {
                setName(dashboard.name);
                setRenaming(true);
              }}
            >
              {strings.dashboards.rename}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={demoMode}
            title={demoMode ? strings.demo.disabledTitle : undefined}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            {strings.dashboards.delete}
          </Button>
        </div>
      </header>

      {dashboard.widgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.dashboards.widgetEmpty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dashboard.widgets.map((widget) => (
            <DashboardWidgetCard
              key={widget.id}
              widget={widget}
              onRemove={() => removeWidget.mutate({ dashboardId: dashboard.id, widgetId: widget.id })}
            />
          ))}
        </div>
      )}

      <AddWidgetDialog
        dashboardId={dashboard.id}
        open={addWidgetOpen}
        onOpenChange={setAddWidgetOpen}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {strings.dashboards.deleteDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>{strings.dashboards.deleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.dashboards.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteDashboard.mutateAsync(dashboard.id);
                navigate("/dashboards");
              }}
            >
              {strings.dashboards.deleteAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
