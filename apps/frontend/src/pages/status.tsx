import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MonitorHistoryStrip } from "@/components/layout/MonitorHistoryStrip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePublicStatus } from "@/services/api";
import { strings } from "@/strings";

/**
 * Standalone, unauthenticated status page (specs/017 FR-001) — a sibling
 * top-level route to AppShell, deliberately without Sidebar/Navbar chrome
 * (research.md decision 4). Renders only what GET /api/public/status
 * returns; a private group is structurally never in that response.
 */
export function StatusPage() {
  const { data: groups, isLoading } = usePublicStatus();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{strings.appTitle}</h1>
          <p className="text-sm text-muted-foreground">{strings.statusPage.subtitle}</p>
        </div>
        <ThemeToggle />
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{strings.dashboard.loading}</p>
      ) : !groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {strings.statusPage.empty}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{group.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {group.monitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{strings.dashboard.empty}</p>
                ) : (
                  group.monitors.map((monitor) => (
                    <div
                      key={monitor.id}
                      className="flex flex-col gap-1.5 border-t border-border/60 pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm">{monitor.name}</span>
                        <StatusBadge status={monitor.status} paused={!monitor.active} />
                      </div>
                      <MonitorHistoryStrip recentHeartbeats={monitor.recentHeartbeats} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
