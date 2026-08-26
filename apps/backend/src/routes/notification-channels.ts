import type { FastifyPluginAsync } from "fastify";
import type { NotificationChannelInput } from "shared-types";
import { toNotificationChannelDTO } from "../mappers.js";
import { notificationProviders } from "../notifications/index.js";

function validateChannelInput(
  input: Partial<NotificationChannelInput>,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (!input.name || !input.name.trim()) {
    errors.push({ field: "name", message: "Name must not be empty" });
  }
  if (!input.url || !isValidUrl(input.url)) {
    errors.push({ field: "url", message: "URL must be a valid absolute URL" });
  }
  return errors;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const notificationChannelRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const channels = await app.prisma.notificationChannel.findMany({
      orderBy: { createdAt: "asc" },
    });
    return channels.map(toNotificationChannelDTO);
  });

  app.post<{ Body: Partial<NotificationChannelInput> }>("/", async (request, reply) => {
    const errors = validateChannelInput(request.body);
    if (errors.length > 0) return reply.status(400).send(errors);

    const created = await app.prisma.notificationChannel.create({
      data: { name: request.body.name!, url: request.body.url! },
    });
    return reply.status(201).send(toNotificationChannelDTO(created));
  });

  app.post<{ Params: { id: string } }>("/:id/test", async (request, reply) => {
    const existing = await app.prisma.notificationChannel.findUnique({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Notification channel not found" });

    const provider = notificationProviders[existing.type as keyof typeof notificationProviders];
    const result = await provider.send(existing.url, {
      monitorName: "Test notification",
      status: "up",
      timestamp: new Date().toISOString(),
      test: true,
    });

    await app.prisma.notificationChannel.update({
      where: { id: existing.id },
      data: { lastDeliveryAt: new Date(), lastDeliveryOk: result.ok },
    });

    return result;
  });

  app.put<{ Params: { id: string }; Body: Partial<NotificationChannelInput> }>(
    "/:id",
    async (request, reply) => {
      const existing = await app.prisma.notificationChannel.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Notification channel not found" });

      if (request.body.name !== undefined || request.body.url !== undefined) {
        const errors = validateChannelInput({
          name: request.body.name ?? existing.name,
          url: request.body.url ?? existing.url,
        });
        if (errors.length > 0) return reply.status(400).send(errors);
      }

      const updated = await app.prisma.notificationChannel.update({
        where: { id: existing.id },
        data: {
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.url !== undefined ? { url: request.body.url } : {}),
          ...(request.body.enabled !== undefined ? { enabled: request.body.enabled } : {}),
        },
      });
      return toNotificationChannelDTO(updated);
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const existing = await app.prisma.notificationChannel.findUnique({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Notification channel not found" });

    await app.prisma.notificationChannel.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  });
};
