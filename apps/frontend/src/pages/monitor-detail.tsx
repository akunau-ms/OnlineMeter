import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import type { Heartbeat, ValidationFieldError } from "shared-types";
import type { HeartbeatRange } from "shared-types";
import {
  ApiValidationError,
  useDeleteMonitor,
  useMonitor,
  useMonitorHeartbeats,
  useMonitorStats,
  usePauseMonitor,
  useResumeMonitor,
  useUpdateMonitor,
  type HeartbeatRangeSelection,
} from "@/services/api";
import { useMonitorHeartbeatStream } from "@/services/realtime";
import { StatusBot } from "@/components/status-bot/StatusBot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { condenseHeartbeats, summarizeGroup } from "@/lib/event-log";
import { strings } from "@/strings";

type LogViewMode = "full" | "condensed";
const LOG_VIEW_STORAGE_KEY = "onlinemeter:eventLogView";

function loadLogViewMode(): LogViewMode {
  if (typeof window === "undefined") return "condensed";
  const stored = window.localStorage.getItem(LOG_VIEW_STORAGE_KEY);
  return stored === "full" ? "full" : "condensed";
}

/** The Select's own value — a preset range, or "custom" while the
 * operator is defining/has defined a custom window (specs/025). Distinct
 * from the range actually passed to useMonitorHeartbeats: "custom" alone
 * isn't a fetchable value until Apply produces a validated {from, to}. */
type RangeMode = HeartbeatRange | "custom";

/** Merges a calendar day with an "HH:mm" time-of-day string. */
function combineDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const combined = new Date(date);
  combined.setHours(hours || 0, minutes || 0, 0, 0);
  return combined;
}

/** specs/025 FR-008: end not before start, and not a period entirely in
 * the future. Server-side also checks ordering/parseability
 * independently (research.md decision 3) — this is the fast client-side
 * guard so the operator never even sends an invalid request. */
function validateCustomRange(from: Date, to: Date): string | null {
  if (to.getTime() < from.getTime()) return strings.detail.logRangeErrorOrder;
  if (from.getTime() > Date.now()) return strings.detail.logRangeErrorFuture;
  return null;
}

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
  // The period selector (specs/025). Resets to "24h" on navigation
  // rather than persisting (spec Assumptions) — unlike the Event Log's
  // Full/Condensed toggle, a stale custom range carrying over to a
  // different monitor could look confusingly empty.
  const [rangeMode, setRangeMode] = React.useState<RangeMode>("24h");
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(undefined);
  const [fromTime, setFromTime] = React.useState("00:00");
  const [toTime, setToTime] = React.useState("23:59");
  const [rangePopoverOpen, setRangePopoverOpen] = React.useState(false);
  const [appliedCustomRange, setAppliedCustomRange] = React.useState<{
    from: string;
    to: string;
  } | null>(null);
  const [customRangeError, setCustomRangeError] = React.useState<string | null>(null);

  const heartbeatSelection: HeartbeatRangeSelection =
    rangeMode === "custom" && appliedCustomRange ? appliedCustomRange : rangeMode === "custom" ? "24h" : rangeMode;
  const { data: initialHeartbeats } = useMonitorHeartbeats(id, heartbeatSelection);
  const [heartbeats, setHeartbeats] = React.useState<Heartbeat[]>([]);
  const pause = usePauseMonitor();
  const resume = useResumeMonitor();
  const deleteMonitor = useDeleteMonitor();
  const [editing, setEditing] = React.useState(false);
  const [logView, setLogView] = React.useState<LogViewMode>(loadLogViewMode);

  React.useEffect(() => {
    setHeartbeats(initialHeartbeats ?? []);
  }, [initialHeartbeats]);

  // A custom window is a fixed historical range — appending live
  // updates timestamped "now" would inject data outside it. Preset
  // ranges always extend to "now", so live updates always belong there.
  // Tracked via a ref (rather than a closed-over value) because
  // useMonitorHeartbeatStream's effect only re-subscribes when `id`
  // changes, so its callback closure would otherwise go stale.
  const isCustomRangeActive = rangeMode === "custom" && appliedCustomRange !== null;
  const isCustomRangeActiveRef = React.useRef(isCustomRangeActive);
  isCustomRangeActiveRef.current = isCustomRangeActive;
  useMonitorHeartbeatStream(id, (heartbeat) => {
    if (isCustomRangeActiveRef.current) return;
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
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CardTitle>{strings.detail.history}</CardTitle>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <Label htmlFor="range-select" className="sr-only">
                {strings.detail.logRangeLabel}
              </Label>
              <Select
                value={rangeMode}
                onValueChange={(value) => {
                  const mode = value as RangeMode;
                  setRangeMode(mode);
                  setCustomRangeError(null);
                  if (mode !== "custom") setAppliedCustomRange(null);
                }}
              >
                <SelectTrigger id="range-select" className="h-8 w-[10rem] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{strings.detail.logRangeLast24h}</SelectItem>
                  <SelectItem value="7d">{strings.detail.logRangeLast7d}</SelectItem>
                  <SelectItem value="30d">{strings.detail.logRangeLast30d}</SelectItem>
                  <SelectItem value="custom">{strings.detail.logRangeCustom}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rangeMode === "custom" ? (
              <div className="flex flex-col items-end gap-2">
                <Popover
                  open={rangePopoverOpen}
                  onOpenChange={(open) => {
                    setRangePopoverOpen(open);
                    if (open) setCustomRangeError(null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 justify-start gap-2 text-xs font-normal"
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {appliedCustomRange
                        ? `${new Date(appliedCustomRange.from).toLocaleString()} – ${new Date(appliedCustomRange.to).toLocaleString()}`
                        : strings.detail.logRangeCustom}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto" align="end">
                    <div className="flex flex-col gap-3">
                      <Calendar
                        mode="range"
                        selected={draftRange}
                        onSelect={setDraftRange}
                        numberOfMonths={2}
                        disabled={{ after: new Date() }}
                      />
                      <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor="range-from-time" className="text-xs text-muted-foreground">
                            {strings.detail.logRangeFrom}
                          </Label>
                          <Input
                            id="range-from-time"
                            type="time"
                            className="h-8 w-auto text-xs"
                            value={fromTime}
                            onChange={(e) => setFromTime(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor="range-to-time" className="text-xs text-muted-foreground">
                            {strings.detail.logRangeTo}
                          </Label>
                          <Input
                            id="range-to-time"
                            type="time"
                            className="h-8 w-auto text-xs"
                            value={toTime}
                            onChange={(e) => setToTime(e.target.value)}
                          />
                        </div>
                      </div>
                      {customRangeError ? (
                        <p className="text-xs text-destructive">{customRangeError}</p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRangePopoverOpen(false)}
                        >
                          {strings.detail.cancel}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            if (!draftRange?.from || !draftRange?.to) {
                              setCustomRangeError(strings.detail.logRangeErrorIncomplete);
                              return;
                            }
                            const from = combineDateAndTime(draftRange.from, fromTime);
                            const to = combineDateAndTime(draftRange.to, toTime);
                            const error = validateCustomRange(from, to);
                            if (error) {
                              setCustomRangeError(error);
                              return;
                            }
                            setCustomRangeError(null);
                            setAppliedCustomRange({ from: from.toISOString(), to: to.toISOString() });
                            setRangePopoverOpen(false);
                          }}
                        >
                          {strings.detail.logRangeApply}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : null}
          </div>
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60">
          <CardTitle>{strings.detail.log}</CardTitle>
          <ToggleGroup
            type="single"
            size="sm"
            value={logView}
            onValueChange={(value) => {
              if (!value) return; // ignore attempts to deselect the only pressed item
              const mode = value as LogViewMode;
              setLogView(mode);
              window.localStorage.setItem(LOG_VIEW_STORAGE_KEY, mode);
            }}
          >
            <ToggleGroupItem value="condensed" aria-label={strings.detail.logViewCondensed}>
              {strings.detail.logViewCondensed}
            </ToggleGroupItem>
            <ToggleGroupItem value="full" aria-label={strings.detail.logViewFull}>
              {strings.detail.logViewFull}
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {heartbeats.length === 0 ? (
            <p className="text-sm text-muted-foreground">{strings.detail.empty}</p>
          ) : logView === "condensed" ? (
            <ul className="flex flex-col text-sm">
              {[...condenseHeartbeats(heartbeats)].reverse().map((group) => {
                const summary = summarizeGroup(group);
                const isStreak = group.entries.length > 1;
                return (
                  <li
                    key={group.entries[group.entries.length - 1].id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.5fr)]"
                  >
                    <span className="truncate text-muted-foreground">
                      {isStreak
                        ? `${new Date(summary.earliestTimestamp).toLocaleString()} – ${new Date(summary.latestTimestamp).toLocaleString()}`
                        : new Date(summary.latestTimestamp).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={summary.status} />
                      {isStreak ? (
                        <span className="text-xs text-muted-foreground">
                          {strings.detail.logStreakSummary(summary.count)}
                        </span>
                      ) : null}
                    </span>
                    <span className="col-span-2 truncate text-left text-muted-foreground sm:col-span-1 sm:text-right">
                      {summary.message}
                    </span>
                  </li>
                );
              })}
            </ul>
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
