import * as React from "react";
import type { DnsRecordType, MonitorInput, MonitorType, ValidationFieldError } from "shared-types";
import { ApiValidationError, useCreateMonitor, useGroups } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { strings } from "@/strings";

const TYPES: { value: MonitorType; label: string; placeholder: string }[] = [
  { value: "http", label: "HTTP(S)", placeholder: "https://example.com" },
  { value: "tcp", label: "TCP", placeholder: "example.com:443" },
  { value: "ping", label: "Ping", placeholder: "example.com" },
  { value: "dns", label: "DNS", placeholder: "example.com" },
  { value: "keyword", label: "Keyword Match", placeholder: "https://example.com" },
  { value: "docker", label: "Docker Container", placeholder: "my-container" },
];

const BASIC_AUTH_TYPES: MonitorType[] = ["http", "keyword"];

const DNS_RECORD_TYPES: DnsRecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT"];
const UNGROUPED_GROUP_VALUE = "__ungrouped__";

export function MonitorForm({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<MonitorType>("http");
  const [target, setTarget] = React.useState("");
  const [intervalSeconds, setIntervalSeconds] = React.useState(60);
  const [timeoutSeconds, setTimeoutSeconds] = React.useState(48);
  const [groupId, setGroupId] = React.useState<string>("");
  const [basicAuthUsername, setBasicAuthUsername] = React.useState("");
  const [basicAuthPassword, setBasicAuthPassword] = React.useState("");
  const [dnsRecordType, setDnsRecordType] = React.useState<DnsRecordType>("A");
  const [dnsExpectedValue, setDnsExpectedValue] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [keywordInvert, setKeywordInvert] = React.useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<ValidationFieldError[]>([]);

  const createMonitor = useCreateMonitor();
  const { data: groups } = useGroups();

  const errorFor = (field: string) => fieldErrors.find((e) => e.field === field)?.message;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors([]);
    const input: MonitorInput = {
      name,
      type,
      target,
      intervalSeconds,
      timeoutSeconds,
      groupId: groupId || null,
      ...(BASIC_AUTH_TYPES.includes(type) && basicAuthUsername && basicAuthPassword
        ? { basicAuthUsername, basicAuthPassword }
        : {}),
      ...(type === "dns" ? { dnsRecordType, dnsExpectedValue: dnsExpectedValue || null } : {}),
      ...(type === "keyword" ? { keyword, keywordInvert } : {}),
    };
    try {
      await createMonitor.mutateAsync(input);
      setName("");
      setTarget("");
      setBasicAuthUsername("");
      setBasicAuthPassword("");
      setKeyword("");
      setKeywordInvert(false);
      onCreated?.();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.fieldErrors);
      } else {
        setFieldErrors([{ field: "form", message: (error as Error).message }]);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="monitor-name"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          {strings.monitorForm.name}
        </Label>
        <Input
          id="monitor-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="bg-background/60"
        />
        {errorFor("name") ? <p className="text-xs text-destructive">{errorFor("name")}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="monitor-type"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          {strings.monitorForm.type}
        </Label>
        <Select value={type} onValueChange={(value) => setType(value as MonitorType)}>
          <SelectTrigger id="monitor-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="monitor-target"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          {strings.monitorForm.target}
        </Label>
        <Input
          id="monitor-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={TYPES.find((t) => t.value === type)?.placeholder}
          required
          className="bg-background/60"
        />
        {errorFor("target") ? (
          <p className="text-xs text-destructive">{errorFor("target")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="monitor-group"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          {strings.monitorForm.group}
        </Label>
        <Select
          value={groupId || UNGROUPED_GROUP_VALUE}
          onValueChange={(value) => setGroupId(value === UNGROUPED_GROUP_VALUE ? "" : value)}
        >
          <SelectTrigger id="monitor-group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNGROUPED_GROUP_VALUE}>{strings.sidebar.ungrouped}</SelectItem>
            {(groups ?? []).map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {type === "dns" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="monitor-dns-record-type"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              {strings.monitorForm.dnsRecordType}
            </Label>
            <Select
              value={dnsRecordType}
              onValueChange={(value) => setDnsRecordType(value as DnsRecordType)}
            >
              <SelectTrigger id="monitor-dns-record-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DNS_RECORD_TYPES.map((rt) => (
                  <SelectItem key={rt} value={rt}>
                    {rt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorFor("dnsRecordType") ? (
              <p className="text-xs text-destructive">{errorFor("dnsRecordType")}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="monitor-dns-expected-value"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              {strings.monitorForm.dnsExpectedValue}
            </Label>
            <Input
              id="monitor-dns-expected-value"
              value={dnsExpectedValue}
              onChange={(e) => setDnsExpectedValue(e.target.value)}
              placeholder={strings.monitorForm.dnsExpectedValueOptional}
              className="bg-background/60"
            />
          </div>
        </div>
      ) : null}

      {type === "keyword" ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border/70 bg-muted/20 p-4">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="monitor-keyword"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              {strings.monitorForm.keyword}
            </Label>
            <Input
              id="monitor-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
              className="bg-background/60"
            />
            {errorFor("keyword") ? (
              <p className="text-xs text-destructive">{errorFor("keyword")}</p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={keywordInvert}
              onChange={(e) => setKeywordInvert(e.target.checked)}
            />
            {strings.monitorForm.keywordInvert}
          </label>
        </div>
      ) : null}

      {BASIC_AUTH_TYPES.includes(type) ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMoreOptionsOpen((v) => !v)}
            aria-expanded={moreOptionsOpen}
            aria-controls="basic-auth-content"
            className="self-start text-muted-foreground hover:text-foreground"
          >
            {moreOptionsOpen ? "▾" : "▸"} {strings.monitorForm.moreOptions}
          </Button>
          {moreOptionsOpen ? (
            <div
              id="basic-auth-content"
              className="flex flex-col gap-3 pt-2 border-t border-border/60"
              role="region"
              aria-label={strings.monitorForm.moreOptions}
            >
              <p className="text-xs text-muted-foreground">{strings.monitorForm.basicAuthHint}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="monitor-basic-auth-username"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    {strings.monitorForm.basicAuthUsername}
                  </Label>
                  <Input
                    id="monitor-basic-auth-username"
                    value={basicAuthUsername}
                    onChange={(e) => setBasicAuthUsername(e.target.value)}
                    autoComplete="off"
                    className="bg-background/60"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="monitor-basic-auth-password"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    {strings.monitorForm.basicAuthPassword}
                  </Label>
                  <Input
                    id="monitor-basic-auth-password"
                    type="password"
                    value={basicAuthPassword}
                    onChange={(e) => setBasicAuthPassword(e.target.value)}
                    autoComplete="new-password"
                    className="bg-background/60"
                  />
                </div>
              </div>
              {errorFor("basicAuthUsername") ? (
                <p className="text-xs text-destructive">{errorFor("basicAuthUsername")}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="monitor-interval"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            {strings.monitorForm.interval}
          </Label>
          <Input
            id="monitor-interval"
            type="number"
            min={20}
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          />
          {errorFor("intervalSeconds") ? (
            <p className="text-xs text-destructive">{errorFor("intervalSeconds")}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="monitor-timeout"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            {strings.monitorForm.timeout}
          </Label>
          <Input
            id="monitor-timeout"
            type="number"
            min={1}
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
          />
          {errorFor("timeoutSeconds") ? (
            <p className="text-xs text-destructive">{errorFor("timeoutSeconds")}</p>
          ) : null}
        </div>
      </div>

      {errorFor("form") ? <p className="text-xs text-destructive">{errorFor("form")}</p> : null}

      <Button type="submit" disabled={createMonitor.isPending} className="h-10">
        {createMonitor.isPending ? strings.monitorForm.submitting : strings.monitorForm.submit}
      </Button>
    </form>
  );
}
