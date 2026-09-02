import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfig, useCreateDashboard, useDashboards } from "@/services/api";
import { strings } from "@/strings";

function CreateDashboardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const createDashboard = useCreateDashboard();
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createDashboard.mutateAsync({ name: name.trim() });
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.dashboards.createDialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-name">{strings.dashboards.nameLabel}</Label>
            <Input
              id="dashboard-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={createDashboard.isPending || demoMode}
              title={demoMode ? strings.demo.disabledTitle : undefined}
            >
              {createDashboard.isPending ? strings.dashboards.creating : strings.dashboards.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardsPage() {
  const { data: dashboards, isLoading } = useDashboards();
  const [createOpen, setCreateOpen] = React.useState(false);
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{strings.dashboards.title}</h1>
          <p className="text-sm text-muted-foreground">{strings.dashboards.subtitle}</p>
        </div>
        <Button
          type="button"
          disabled={demoMode}
          title={demoMode ? strings.demo.disabledTitle : undefined}
          onClick={() => setCreateOpen(true)}
        >
          {strings.dashboards.newDashboard}
        </Button>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{strings.dashboard.loading}</p>
      ) : !dashboards || dashboards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.dashboards.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dashboards.map((dashboard) => (
            <Link key={dashboard.id} to={`/dashboards/${dashboard.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">{dashboard.name}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateDashboardDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
