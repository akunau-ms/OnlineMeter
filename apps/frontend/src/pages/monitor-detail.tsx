import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Heartbeat, ValidationFieldError } from "shared-types";
import {
  ApiValidationError,
  useDeleteMonitor,
  useMonitor,
  useMonitorHeartbeats,
  useMonitorStats,
  usePauseMonitor,
  useResumeMonitor,
  useUpdateMonitor,
} from "@/services/api";
import { useMonitorHeartbeatStream } from "@/services/realtime";
import { StatusBot } from "@/components/status-bot/StatusBot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { strings } from "@/strings";

const EDIT_FIELDS = ["name", "target", "intervalSeconds"] as const;

/** Edit action + inline form (specs/022) — name/target/interval only,
 * never type (research.md decision 1). Reuses the existing PUT endpoint,
 * so history/stats/log are untouched by a save. */
function EditMonitorForm({
  monitorId,
  initialName,
  initialTarget,
  initialIntervalSeconds,
  onDone,
}: {
  monitorId: string;
  initialName: string;
  initialTarget: string;
  initialIntervalSeconds: number;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [target, setTarget] = React.useState(initialTarget);
  const [intervalSeconds, setIntervalSeconds] = React.useState(initialIntervalSeconds);
  const [fieldErrors, setFieldErrors] = React.useState<ValidationFieldError[]>([]);
  const updateMonitor = useUpdateMonitor();

  const errorFor = (field: string) => fieldErrors.find((e) => e.field === field)?.message;
  // Errors for fields this form doesn't show (e.g. timeoutSeconds, when a
  // lowered interval conflicts with the monitor's existing timeout) —
  // surfaced plainly rather than silently dropped (research.md decision 2).
  const generalErrors = fieldErrors.filter(
    (e) => !(EDIT_FIELDS as readonly string[]).includes(e.field),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors([]);
    try {
      await updateMonitor.mutateAsync({ id: monitorId, name, target, intervalSeconds });
      onDone();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.fieldErrors);
      } else {
        setFieldErrors([{ field: "form", message: (error as Error).message }]);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-border/60 pt-4">
      {generalErrors.map((e) => (
        <p key={e.field} className="text-sm text-destructive">
          {e.message}
        </p>
      ))}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-name" className="text-xs uppercase tracking-wide text-muted-foreground">
            {strings.monitorForm.name}
          </Label>
          <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          {errorFor("name") ? <p className="text-xs text-destructive">{errorFor("name")}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="edit-target"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            {strings.monitorForm.target}
          </Label>
          <Input
            id="edit-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
          {errorFor("target") ? (
            <p className="text-xs text-destructive">{errorFor("target")}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="edit-interval"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            {strings.monitorForm.interval}
          </Label>
          <Input
            id="edit-interval"
            type="number"
            min={1}
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
            required
          />
          {errorFor("intervalSeconds") ? (
            <p className="text-xs text-destructive">{errorFor("intervalSeconds")}</p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={updateMonitor.isPending}>
          {updateMonitor.isPending ? strings.detail.saving : strings.detail.save}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {strings.detail.cancel}
        </Button>
      </div>
    </form>
  );
}

const responseTimeChartConfig = {
  responseTimeMs: {
    label: "Response time",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  );
}

export function MonitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: monitor } = useMonitor(id);
  const { data: stats } = useMonitorStats(id);
  const { data: initialHeartbeats } = useMonitorHeartbeats(id);
  const [heartbeats, setHeartbeats] = React.useState<Heartbeat[]>([]);
  const pause = usePauseMonitor();
  const resume = useResumeMonitor();
  const deleteMonitor = useDeleteMonitor();
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (initialHeartbeats) setHeartbeats(initialHeartbeats);
  }, [initialHeartbeats]);

  useMonitorHeartbeatStream(id, (heartbeat) => {
    setHeartbeats((prev) => [...prev, heartbeat]);
  });

  if (!monitor) return null;

  const paused = !monitor.active;
  const chartData = heartbeats.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString(),
    responseTimeMs: h.responseTimeMs ?? 0,
  }));

  return (
    <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                <StatusBot
                  status={monitor.status}
                  paused={paused}
                  size={44}
                  paper="hsl(var(--muted))"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {strings.detail.history}
                </p>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
                  {monitor.name}
                </h1>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {monitor.type.toUpperCase()} · {monitor.target}
                </p>
                {monitor.certificateExpiresAt ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {strings.detail.certificateExpires}{" "}
                    {new Date(monitor.certificateExpiresAt).toLocaleDateString()}
                    {monitor.certificateExpiringSoon ? (
                      <Badge variant="destructive">{strings.detail.certificateExpiringSoon}</Badge>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
            <StatusBadge status={monitor.status} paused={paused} className="self-start" />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (paused ? resume.mutate(monitor.id) : pause.mutate(monitor.id))}
            >
              {paused ? strings.detail.resume : strings.detail.pause}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              {strings.detail.edit}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(strings.detail.deleteConfirm)) {
                  deleteMonitor.mutate(monitor.id, { onSuccess: () => navigate("/") });
                }
              }}
            >
              {strings.detail.delete}
            </Button>
          </div>
          {editing ? (
            <EditMonitorForm
              monitorId={monitor.id}
              initialName={monitor.name}
              initialTarget={monitor.target}
              initialIntervalSeconds={monitor.intervalSeconds}
              onDone={() => setEditing(false)}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/60">
          <CardTitle>{strings.detail.stats.current}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={strings.detail.stats.current}
            value={stats?.currentResponseTimeMs != null ? `${stats.currentResponseTimeMs}ms` : "—"}
          />
          <StatTile
            label={strings.detail.stats.avg24h}
            value={stats?.avgResponseTimeMs24h != null ? `${stats.avgResponseTimeMs24h}ms` : "—"}
          />
          <StatTile
            label={strings.detail.stats.uptime24h}
            value={stats?.uptime24h != null ? `${stats.uptime24h}%` : "—"}
          />
          <StatTile
            label={strings.detail.stats.uptime30d}
            value={stats?.uptime30d != null ? `${stats.uptime30d}%` : "—"}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60">
          <CardTitle>{strings.detail.history}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">{strings.detail.empty}</p>
          ) : (
            <ChartContainer
              config={responseTimeChartConfig}
              role="img"
              aria-label={strings.detail.history}
              className="aspect-auto h-[300px] w-full sm:h-[340px]"
            >
              <AreaChart data={chartData} margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="fillResponseTime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-responseTimeMs)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-responseTimeMs)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} unit="ms" />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Area
                  dataKey="responseTimeMs"
                  type="natural"
                  fill="url(#fillResponseTime)"
                  stroke="var(--color-responseTimeMs)"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60">
          <CardTitle>{strings.detail.log}</CardTitle>
        </CardHeader>
        <CardContent>
          {heartbeats.length === 0 ? (
            <p className="text-sm text-muted-foreground">{strings.detail.empty}</p>
          ) : (
            <ul className="flex flex-col text-sm">
              {[...heartbeats].reverse().map((h) => (
                <li
                  key={h.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.5fr)]"
                >
                  <span className="truncate text-muted-foreground">
                    {new Date(h.timestamp).toLocaleString()}
                  </span>
                  <StatusBadge status={h.status} />
                  <span className="col-span-2 truncate text-left text-muted-foreground sm:col-span-1 sm:text-right">
                    {h.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
