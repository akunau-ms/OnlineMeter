import type { NotificationChannelType } from "shared-types";
import type { NotificationProvider } from "./types.js";
import { webhookProvider } from "./webhook.js";

export const notificationProviders: Record<NotificationChannelType, NotificationProvider> = {
  webhook: webhookProvider,
};
