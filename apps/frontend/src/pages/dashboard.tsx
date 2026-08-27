import * as React from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import type { MonitorListItem, MonitorStatus } from "shared-types";
import { useConfig, useDashboardTrend, useMonitors } from "@/services/api";
import { applyStatusPatch, useRealtimeMonitors } from "@/services/realtime";
import { StatusDot } from "@/components/status-bot/StatusDot";
import { MonitorForm } from "@/components/monitor-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendBadge } from "@/components/ui/trend-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { strings } from "@/strings";

const trendChartConfig = {
  uptimePercent: {
    label: "Uptime",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

function recentUptime(monitor: MonitorListItem): number | null {
  if (monitor.recentHeartbeats.length === 0) return null;
  const upCount = monitor.recentHeartbeats.filter((h) => h.status === "up").length;
  return Math.round((upCount / monitor.recentHeartbeats.length) * 1000) / 10;
}

function StatCard({
  label,
  value,
  context,
  badge,
  variant,
  status,
  paused,
}: {
  label: string;
  value: number;
  context: string;
  badge: string;
  variant: "outline" | "success" | "destructive" | "muted";
  /** When set, renders the icon-pill StatusBadge (with `badge` as its label) instead of a plain Badge. */
  status?: MonitorStatus;
  paused?: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-normal text-muted-foreground">{label}</CardTitle>
        {status ? (
          <StatusBadge
            status={status}
            paused={paused}
            label={badge}
            className="px-2 py-0 text-[10px]"
          />
        ) : (
          <Badge variant={variant} className="px-2 py-0 text-[10px]">
            {badge}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        <p className="text-xs text-muted-foreground">{context}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: monitors, isLoading } = useMonitors();
  const { statusById, connected } = useRealtimeMonitors();
  const [range, setRange] = React.useState<"7d" | "30d">("7d");
  const { data: trend } = useDashboardTrend(range);
  const [showForm, setShowForm] = React.useState(false);
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;

  const merged = (monitors ?? []).map((m) => applyStatusPatch(m, statusById));
  const total = merged.length;
  const upCount = merged.filter((m) => m.active && m.status === "up").length;
  const downCount = merged.filter((m) => m.active && m.status === "down").length;
  const pendingCount = merged.filter((m) => m.active && m.status === "pending").length;
  const pausedCount = merged.filter((m) => !m.active).length;

  const chartData = (trend ?? []).map((p) => ({
    date: p.date.slice(5),
    uptimePercent: p.uptimePercent ?? 0,
    avgResponseTimeMs: p.avgResponseTimeMs,
  }));
  const trendDelta =
    (trend?.length ?? 0) >= 2
      ? (trend![trend!.length - 1].uptimePercent ?? 0) - (trend![0].uptimePercent ?? 0)
      : null;

  const isEmpty = !isLoading && total === 0;

  return (
    <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-5 overflow-x-hidden p-4 sm:gap-6 sm:p-6 lg:p-8">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {strings.dashboard.eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{strings.dashboard.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? <Badge variant="muted">{strings.dashboard.disconnected}</Badge> : null}
          <Button
            size="sm"
            aria-expanded={showForm}
            aria-controls="monitor-form"
            disabled={demoMode}
            title={demoMode ? strings.demo.disabledTitle : undefined}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? strings.dashboard.closeForm : strings.dashboard.addMonitor}
          </Button>
        </div>
      </div>

      {showForm ? (
        <Card id="monitor-form" className="overflow-hidden">
          <CardHeader>
            <CardTitle>{strings.monitorForm.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <MonitorForm
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: ["monitors"] });
                setShowForm(false);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center py-12 text-sm text-muted-foreground">
            {strings.dashboard.loading}
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">{strings.dashboard.empty}</p>
            {!showForm && !demoMode ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                {strings.dashboard.addMonitor}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label={strings.dashboard.stats.total}
              value={total}
              context={strings.dashboard.statsContext.total}
              badge={strings.dashboard.statsBadge.total}
              variant="outline"
            />
            <StatCard
              label={strings.dashboard.stats.up}
              value={upCount}
              context={strings.dashboard.statsContext.up}
              badge={strings.dashboard.statsBadge.up}
              variant="success"
              status="up"
            />
            <StatCard
              label={strings.dashboard.stats.down}
              value={downCount}
              context={strings.dashboard.statsContext.down}
              badge={strings.dashboard.statsBadge.down}
              variant="destructive"
              status="down"
            />
            <StatCard
              label={strings.dashboard.stats.paused}
              value={pausedCount}
              context={strings.dashboard.statsContext.paused}
              badge={strings.dashboard.statsBadge.paused}
              variant="muted"
              status="pending"
              paused
            />
            <StatCard
              label={strings.dashboard.stats.pending}
              value={pendingCount}
              context={strings.dashboard.statsContext.pending}
              badge={strings.dashboard.statsBadge.pending}
              variant="outline"
              status="pending"
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="gap-4 border-b border-border/60 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{strings.dashboard.trend.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{strings.dashboard.trend.subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {trendDelta !== null ? <TrendBadge value={trendDelta} /> : null}
                <div className="flex items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
                  <Button
                    type="button"
                    variant={range === "7d" ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={range === "7d"}
                    onClick={() => setRange("7d")}
                    className={`h-7 rounded px-2 py-1 text-xs ${range === "7d" ? "" : "text-muted-foreground"}`}
                  >
                    {strings.dashboard.trend.range7d}
                  </Button>
                  <Button
                    type="button"
                    variant={range === "30d" ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={range === "30d"}
                    onClick={() => setRange("30d")}
                    className={`h-7 rounded px-2 py-1 text-xs ${range === "30d" ? "" : "text-muted-foreground"}`}
                  >
                    {strings.dashboard.trend.range30d}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  {strings.detail.empty}
                </div>
              ) : (
                <ChartContainer
                  config={trendChartConfig}
                  role="img"
                  aria-label={strings.dashboard.trend.title}
                  className="aspect-auto h-[300px] w-full sm:h-[340px] lg:h-[380px]"
                >
                  <AreaChart data={chartData} margin={{ left: 12, right: 12 }}>
                    <defs>
                      <linearGradient id="fillUptime" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-uptimePercent)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-uptimePercent)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={12}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={12}
                      unit="%"
                      domain={[0, 100]}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="line" />}
                    />
                    <Area
                      dataKey="uptimePercent"
                      type="natural"
                      fill="url(#fillUptime)"
                      stroke="var(--color-uptimePercent)"
                      dot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                        const { cx, cy, index } = dotProps;
                        if (index !== chartData.length - 1 || cx === undefined || cy === undefined) {
                          return <React.Fragment key={`trend-dot-${index}`} />;
                        }
                        return (
                          <circle
                            key={`trend-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill="var(--color-uptimePercent)"
                            stroke="hsl(var(--background))"
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="gap-1 border-b border-border/60">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>{strings.dashboard.table.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {strings.dashboard.table.subtitle}
                  </p>
                </div>
                <Badge variant="muted" className="shrink-0">
                  {total}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table
                aria-label={strings.dashboard.table.title}
                className="min-w-[640px] w-full text-sm"
              >
                <thead className="bg-muted/30">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">{strings.dashboard.table.name}</th>
                    <th className="px-4 py-2.5 font-medium">{strings.dashboard.table.type}</th>
                    <th className="px-4 py-2.5 font-medium">{strings.dashboard.table.target}</th>
                    <th className="px-4 py-2.5 font-medium">{strings.dashboard.table.status}</th>
                    <th className="px-4 py-2.5 font-medium">
                      {strings.dashboard.table.uptimeRecent}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {merged.map((monitor) => {
                    const paused = !monitor.active;
                    const uptime = recentUptime(monitor);
                    return (
                      <tr
                        key={monitor.id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/monitors/${monitor.id}`}
                            className="flex items-center gap-2 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <StatusDot status={monitor.status} paused={paused} />
                            {monitor.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {monitor.type.toUpperCase()}
                        </td>
                        <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground">
                          {monitor.target}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={monitor.status} paused={paused} />
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {uptime !== null ? `${uptime}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
