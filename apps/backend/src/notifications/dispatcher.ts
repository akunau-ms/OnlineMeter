import type { FastifyInstance } from "fastify";
import type { NotificationChannelType } from "shared-types";
import { notificationProviders } from "./index.js";

/**
 * Loads every enabled channel and attempts delivery to each independently
 * — one channel's failure (or an unknown/future `type`) never prevents
 * another's attempt. Called fire-and-forget from the scheduler (FR-010,
 * specs/018 research.md decision 3), so it must never throw.
 */
export async function dispatchStatusChange(
  app: FastifyInstance,
  monitorId: string,
  monitorName: string,
  status: "up" | "down",
): Promise<void> {
  const channels = await app.prisma.notificationChannel.findMany({ where: { enabled: true } });

  await Promise.all(
    channels.map(async (channel) => {
      const provider = notificationProviders[channel.type as NotificationChannelType];
      if (!provider) return;

      const result = await provider.send(channel.url, {
        monitorName,
        status,
        timestamp: new Date().toISOString(),
      });

      await app.prisma.notificationChannel.update({
        where: { id: channel.id },
        data: { lastDeliveryAt: new Date(), lastDeliveryOk: result.ok },
      });
    }),
  );
}
