import * as React from "react";
import type { NotificationChannel } from "shared-types";
import {
  useCreateNotificationChannel,
  useDeleteNotificationChannel,
  useNotificationChannels,
  useTestNotificationChannel,
  useUpdateNotificationChannel,
} from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { strings } from "@/strings";

function DeliveryBadge({ channel }: { channel: NotificationChannel }) {
  if (channel.lastDeliveryOk === null) {
    return <Badge variant="status-outline">{strings.settings.deliveryNever}</Badge>;
  }
  return channel.lastDeliveryOk ? (
    <Badge variant="status-success">{strings.settings.deliverySucceeded}</Badge>
  ) : (
    <Badge variant="status-destructive">{strings.settings.deliveryFailed}</Badge>
  );
}

function ChannelCard({ channel }: { channel: NotificationChannel }) {
  const testChannel = useTestNotificationChannel();
  const updateChannel = useUpdateNotificationChannel();
  const deleteChannel = useDeleteNotificationChannel();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm font-semibold">{channel.name}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">{channel.url}</p>
        </div>
        <Badge variant={channel.enabled ? "outline" : "muted"}>
          {channel.enabled ? strings.settings.enable : strings.settings.disable}
        </Badge>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <DeliveryBadge channel={channel} />
        <span className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testChannel.isPending}
            onClick={() => testChannel.mutate(channel.id)}
          >
            {testChannel.isPending ? strings.settings.testing : strings.settings.test}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={updateChannel.isPending}
            onClick={() =>
              updateChannel.mutate({ id: channel.id, enabled: !channel.enabled })
            }
          >
            {channel.enabled ? strings.settings.disable : strings.settings.enable}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            {strings.settings.delete}
          </Button>
        </span>
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{strings.settings.deleteChannelTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {strings.settings.deleteChannelConfirm}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{strings.settings.deleteChannelCancel}</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteChannel.mutate(channel.id)}>
                {strings.settings.deleteChannelAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function AddChannelForm() {
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const createChannel = useCreateNotificationChannel();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    await createChannel.mutateAsync({ name: name.trim(), url: url.trim() });
    setName("");
    setUrl("");
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          {strings.settings.addChannelTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="channel-name">{strings.settings.channelName}</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="channel-url">{strings.settings.channelUrl}</Label>
            <Input
              id="channel-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={createChannel.isPending}>
            {createChannel.isPending ? strings.settings.adding : strings.settings.addChannel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { data: channels, isLoading } = useNotificationChannels();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-lg font-semibold">{strings.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{strings.settings.subtitle}</p>
      </header>

      <AddChannelForm />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{strings.dashboard.loading}</p>
      ) : !channels || channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.settings.channelsEmpty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}
