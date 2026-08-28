import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Globe, GlobeLock, MoreHorizontal } from "lucide-react";
import type { Group, MonitorListItem } from "shared-types";
import { useDeleteGroup, useRenameGroup, useSetGroupPublic } from "@/services/api";
import { StatusDot } from "@/components/status-bot/StatusDot";
import { MonitorHistoryStrip } from "@/components/layout/MonitorHistoryStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [nameDraft, setNameDraft] = React.useState(group?.name ?? "");
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();
  const setGroupPublic = useSetGroupPublic();

  const title = group?.name ?? strings.sidebar.ungrouped;

  // Deferring the state update by a tick (research.md decision 3) avoids a
  // known Radix race: closing a DropdownMenu and opening a Dialog/AlertDialog
  // in the same event tick can make the dialog fail to open or lose focus,
  // since both fight over returning focus to the trigger on close.
  function openAfterMenuCloses(open: () => void) {
    setTimeout(open, 0);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !nameDraft.trim()) return;
    await renameGroup.mutateAsync({ id: group.id, name: nameDraft.trim() });
    setRenameDialogOpen(false);
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
          <span className="truncate">
            {title} ({monitors.length})
          </span>
        </Button>
        {group ? (
          <span className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover/section:opacity-100 sm:group-focus-within/section:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={strings.sidebar.groupActions}
                  className="h-7 w-7 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    setGroupPublic.mutate({
                      id: group.id,
                      name: group.name,
                      isPublic: !group.isPublic,
                    })
                  }
                >
                  {group.isPublic ? (
                    <GlobeLock className="h-3.5 w-3.5" />
                  ) : (
                    <Globe className="h-3.5 w-3.5" />
                  )}
                  {group.isPublic ? strings.sidebar.makeGroupPrivate : strings.sidebar.makeGroupPublic}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    openAfterMenuCloses(() => {
                      setNameDraft(group.name);
                      setRenameDialogOpen(true);
                    });
                  }}
                >
                  {strings.sidebar.renameGroup}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    openAfterMenuCloses(() => setDeleteConfirmOpen(true));
                  }}
                >
                  {strings.sidebar.deleteGroup}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>{strings.sidebar.renameDialogTitle}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitRename} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${sectionId}-rename`}>{strings.sidebar.renameDialogLabel}</Label>
                    <Input
                      id={`${sectionId}-rename`}
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setRenameDialogOpen(false)}>
                      {strings.sidebar.renameDialogCancel}
                    </Button>
                    <Button type="submit">{strings.sidebar.renameDialogSave}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
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
