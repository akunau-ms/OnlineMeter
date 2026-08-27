import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Globe, GlobeLock, Pencil, Trash2 } from "lucide-react";
import type { Group, MonitorListItem } from "shared-types";
import { useConfig, useDeleteGroup, useRenameGroup, useSetGroupPublic } from "@/services/api";
import { StatusDot } from "@/components/status-bot/StatusDot";
import { MonitorHistoryStrip } from "@/components/layout/MonitorHistoryStrip";
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
import { cn } from "@/lib/utils";
import { strings } from "@/strings";

export interface GroupSectionProps {
  group: Group | null; // null = the "Ungrouped" pseudo-section
  monitors: MonitorListItem[];
  selectedId: string | undefined;
  expanded: boolean;
  onToggle: () => void;
}

/** Collapsible sidebar section for one group's monitors (FR-010), or the "Ungrouped" bucket. */
export function GroupSection({
  group,
  monitors,
  selectedId,
  expanded,
  onToggle,
}: GroupSectionProps) {
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(group?.name ?? "");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();
  const setGroupPublic = useSetGroupPublic();
  const { data: appConfig } = useConfig();
  const demoMode = appConfig?.demoMode ?? false;

  const title = group?.name ?? strings.sidebar.ungrouped;

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !nameDraft.trim()) return;
    await renameGroup.mutateAsync({ id: group.id, name: nameDraft.trim() });
    setRenaming(false);
  }

  const sectionId = group ? `group-${group.id}` : "group-ungrouped";

  return (
    <div className="group/section rounded-lg p-1 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={sectionId}
          className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {renaming ? null : (
            <span className="truncate">
              {title} ({monitors.length})
            </span>
          )}
        </Button>
        {renaming ? (
          <form onSubmit={submitRename} className="flex flex-1 items-center gap-1">
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="h-8 flex-1 text-xs"
            />
          </form>
        ) : group ? (
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/section:opacity-100 sm:group-focus-within/section:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                group.isPublic ? strings.sidebar.makeGroupPrivate : strings.sidebar.makeGroupPublic
              }
              aria-pressed={group.isPublic}
              title={
                demoMode
                  ? strings.demo.disabledTitle
                  : group.isPublic
                    ? strings.sidebar.makeGroupPrivate
                    : strings.sidebar.makeGroupPublic
              }
              disabled={demoMode}
              onClick={() =>
                setGroupPublic.mutate({ id: group.id, name: group.name, isPublic: !group.isPublic })
              }
              className={cn(
                "h-7 w-7 rounded p-0.5 hover:text-foreground",
                group.isPublic ? "text-primary" : "text-muted-foreground",
              )}
            >
              {group.isPublic ? <Globe className="h-3 w-3" /> : <GlobeLock className="h-3 w-3" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={strings.sidebar.renameGroup}
              title={demoMode ? strings.demo.disabledTitle : undefined}
              disabled={demoMode}
              onClick={() => {
                setNameDraft(group.name);
                setRenaming(true);
              }}
              className="h-7 w-7 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={strings.sidebar.deleteGroup}
              title={demoMode ? strings.demo.disabledTitle : undefined}
              disabled={demoMode}
              onClick={() => setDeleteConfirmOpen(true)}
              className="h-7 w-7 rounded p-0.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{strings.sidebar.deleteGroupTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {strings.sidebar.deleteGroupConfirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{strings.sidebar.deleteGroupCancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteGroup.mutate(group.id)}>
                    {strings.sidebar.deleteGroupAction}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </span>
        ) : null}
      </div>

      {expanded ? (
        <ul id={sectionId} className="ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
          {monitors.map((monitor) => (
            <li key={monitor.id}>
              <Link
                to={`/monitors/${monitor.id}`}
                aria-current={selectedId === monitor.id ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col gap-1 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary",
                  selectedId === monitor.id && "bg-muted",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StatusDot status={monitor.status} paused={!monitor.active} />
                  <span className="truncate">{monitor.name}</span>
                </span>
                <MonitorHistoryStrip recentHeartbeats={monitor.recentHeartbeats} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
