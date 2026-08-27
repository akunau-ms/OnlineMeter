import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, Search } from "lucide-react";
import type { MonitorListItem } from "shared-types";
import { useConfig, useCreateGroup, useGroups, useMonitors } from "@/services/api";
import { applyStatusPatch, useRealtimeMonitors } from "@/services/realtime";
import { GroupSection } from "@/components/layout/GroupSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings";

const UNGROUPED_KEY = "__ungrouped__";

export function Sidebar() {
  const { id: selectedId } = useParams<{ id: string }>();
  const { data: monitors } = useMonitors();
  const { data: groups } = useGroups();
  const { statusById } = useRealtimeMonitors();
  const createGroup = useCreateGroup();
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;

  const [search, setSearch] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [newGroupName, setNewGroupName] = React.useState("");

  const merged = (monitors ?? []).map((m) => applyStatusPatch(m, statusById));
  const query = search.trim().toLowerCase();
  const filtered = query ? merged.filter((m) => m.name.toLowerCase().includes(query)) : merged;

  const byGroup = new Map<string, MonitorListItem[]>();
  for (const monitor of filtered) {
    const key = monitor.groupId ?? UNGROUPED_KEY;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(monitor);
    else byGroup.set(key, [monitor]);
  }

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    await createGroup.mutateAsync({ name: newGroupName.trim() });
    setNewGroupName("");
  }

  const isSearching = query.length > 0;

  return (
    <aside className="flex h-[min(45vh,28rem)] min-h-0 w-full shrink-0 flex-col border-b border-border/60 bg-card lg:h-full lg:w-72 lg:border-b-0 lg:border-r">
      <div className="px-4 pb-3 pt-4">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </span>
          <span className="truncate">{strings.appTitle}</span>
        </Link>
      </div>
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={strings.sidebar.searchPlaceholder}
            aria-label={strings.sidebar.searchPlaceholder}
            className="pl-8"
          />
        </div>
      </div>
      <nav aria-label={strings.appTitle} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {isSearching && filtered.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">{strings.sidebar.noResults}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {(groups ?? []).map((group) => {
              const groupMonitors = byGroup.get(group.id) ?? [];
              // While searching, hide groups with no match rather than
              // showing empty sections for irrelevant groups; otherwise
              // every group (including a brand-new, empty one) stays
              // visible per FR-008 acceptance scenario 1.
              if (isSearching && groupMonitors.length === 0) return null;
              return (
                <GroupSection
                  key={group.id}
                  group={group}
                  monitors={groupMonitors}
                  selectedId={selectedId}
                  // Auto-expand every section while searching, so a match is
                  // never hidden inside a collapsed group (FR-012).
                  expanded={isSearching || !collapsed[group.id]}
                  onToggle={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                />
              );
            })}
            {byGroup.has(UNGROUPED_KEY) ? (
              <GroupSection
                group={null}
                monitors={byGroup.get(UNGROUPED_KEY)!}
                selectedId={selectedId}
                expanded={isSearching || !collapsed[UNGROUPED_KEY]}
                onToggle={() => setCollapsed((c) => ({ ...c, [UNGROUPED_KEY]: !c[UNGROUPED_KEY] }))}
              />
            ) : null}
          </div>
        )}
      </nav>
      <form onSubmit={handleAddGroup} className="flex gap-2 border-t border-border/60 p-3">
        <Input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder={strings.sidebar.addGroupPlaceholder}
          aria-label={strings.sidebar.addGroupPlaceholder}
          className="h-8 min-w-0 flex-1 bg-background/70 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={createGroup.isPending || demoMode}
          title={demoMode ? strings.demo.disabledTitle : undefined}
          className="shrink-0"
        >
          {strings.sidebar.addGroup}
        </Button>
      </form>
    </aside>
  );
}
