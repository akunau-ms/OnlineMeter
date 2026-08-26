import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { DnsRecordType, MonitorInput, ValidationFieldError } from "shared-types";
import { toMonitorDTO, toMonitorListItemDTO } from "../mappers.js";
import { validateMonitorInput } from "./validation.js";
import { probeDockerSocket } from "../checkers/docker.js";

/**
 * Fails a Docker monitor create/edit immediately when the Docker socket
 * isn't reachable (FR-011), rather than only discovering it on the first
 * scheduled check.
 */
async function validateDockerSocketReachable(
  type: MonitorInput["type"] | undefined,
): Promise<ValidationFieldError[]> {
  if (type !== "docker") return [];
  const probe = await probeDockerSocket();
  return probe.reachable ? [] : [{ field: "target", message: probe.message! }];
}

function emitMonitorUpdate(app: FastifyInstance, monitor: ReturnType<typeof toMonitorDTO>): void {
  app.io.emit("monitor:update", {
    monitorId: monitor.id,
    status: monitor.status,
    active: monitor.active,
    updatedAt: monitor.updatedAt,
  });
}

/** Confirms a provided groupId (if any) references an existing Group. */
async function validateGroupIdExists(
  app: FastifyInstance,
  groupId: string | null | undefined,
): Promise<ValidationFieldError[]> {
  if (!groupId) return [];
  const group = await app.prisma.group.findUnique({ where: { id: groupId } });
  return group ? [] : [{ field: "groupId", message: "Unknown group" }];
}

export const monitorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const monitors = await app.prisma.monitor.findMany({
      orderBy: { createdAt: "asc" },
      include: { heartbeats: { orderBy: { timestamp: "desc" }, take: 20 } },
    });
    return monitors.map(toMonitorListItemDTO);
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const monitor = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
    if (!monitor) return reply.status(404).send({ error: "Monitor not found" });
    return toMonitorDTO(monitor);
  });

  app.post<{ Body: Partial<MonitorInput> }>("/", async (request, reply) => {
    const errors = [
      ...validateMonitorInput(request.body),
      ...(await validateGroupIdExists(app, request.body.groupId)),
      ...(await validateDockerSocketReachable(request.body.type)),
    ];
    if (errors.length > 0) return reply.status(400).send(errors);

    const input = request.body as MonitorInput;
    const intervalSeconds = input.intervalSeconds ?? 60;
    const created = await app.prisma.monitor.create({
      data: {
        name: input.name,
        type: input.type,
        target: input.target,
        intervalSeconds,
        timeoutSeconds: input.timeoutSeconds ?? 48,
        retries: input.retries ?? 0,
        retryIntervalSeconds: input.retryIntervalSeconds ?? intervalSeconds,
        expectedStatusMin: input.type === "http" ? (input.expectedStatusMin ?? 200) : null,
        expectedStatusMax: input.type === "http" ? (input.expectedStatusMax ?? 299) : null,
        groupId: input.groupId ?? null,
        basicAuthUsername:
          input.type === "http" || input.type === "keyword" ? (input.basicAuthUsername ?? null) : null,
        basicAuthPassword:
          input.type === "http" || input.type === "keyword" ? (input.basicAuthPassword ?? null) : null,
        dnsRecordType: input.type === "dns" ? (input.dnsRecordType ?? null) : null,
        dnsExpectedValue: input.type === "dns" ? (input.dnsExpectedValue ?? null) : null,
        keyword: input.type === "keyword" ? (input.keyword ?? null) : null,
        keywordInvert: input.type === "keyword" ? (input.keywordInvert ?? false) : false,
      },
    });

    const monitor = toMonitorDTO(created);
    app.scheduler.start(monitor);
    emitMonitorUpdate(app, monitor);
    return reply.status(201).send(monitor);
  });

  app.put<{ Params: { id: string }; Body: Partial<MonitorInput> }>(
    "/:id",
    async (request, reply) => {
      const existing = await app.prisma.monitor.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Monitor not found" });

      if (request.body.type && request.body.type !== existing.type) {
        return reply
          .status(400)
          .send([{ field: "type", message: "Monitor type cannot be changed after creation" }]);
      }

      const merged: Partial<MonitorInput> = {
        name: request.body.name ?? existing.name,
        type: existing.type as MonitorInput["type"],
        target: request.body.target ?? existing.target,
        intervalSeconds: request.body.intervalSeconds ?? existing.intervalSeconds,
        timeoutSeconds: request.body.timeoutSeconds ?? existing.timeoutSeconds,
        retries: request.body.retries ?? existing.retries,
        retryIntervalSeconds: request.body.retryIntervalSeconds ?? existing.retryIntervalSeconds,
        expectedStatusMin: request.body.expectedStatusMin ?? existing.expectedStatusMin ?? undefined,
        expectedStatusMax: request.body.expectedStatusMax ?? existing.expectedStatusMax ?? undefined,
        dnsRecordType:
          request.body.dnsRecordType ?? (existing.dnsRecordType as DnsRecordType | null) ?? undefined,
        dnsExpectedValue: request.body.dnsExpectedValue ?? existing.dnsExpectedValue ?? undefined,
        keyword: request.body.keyword ?? existing.keyword ?? undefined,
        keywordInvert: request.body.keywordInvert ?? existing.keywordInvert,
      };

      const nextGroupId = request.body.groupId !== undefined ? request.body.groupId : existing.groupId;
      // Omitted = leave unchanged, null = clear, string = set (data-model.md).
      const nextBasicAuthUsername =
        request.body.basicAuthUsername !== undefined
          ? request.body.basicAuthUsername
          : existing.basicAuthUsername;
      const nextBasicAuthPassword =
        request.body.basicAuthPassword !== undefined
          ? request.body.basicAuthPassword
          : existing.basicAuthPassword;
      const errors = [
        ...validateMonitorInput({
          ...merged,
          basicAuthUsername: nextBasicAuthUsername,
          basicAuthPassword: nextBasicAuthPassword,
        }),
        ...(await validateGroupIdExists(app, nextGroupId)),
        ...(await validateDockerSocketReachable(merged.type)),
      ];
      if (errors.length > 0) return reply.status(400).send(errors);

      const updated = await app.prisma.monitor.update({
        where: { id: existing.id },
        data: {
          name: merged.name,
          target: merged.target,
          intervalSeconds: merged.intervalSeconds,
          timeoutSeconds: merged.timeoutSeconds,
          retries: merged.retries,
          retryIntervalSeconds: merged.retryIntervalSeconds,
          expectedStatusMin: merged.expectedStatusMin ?? null,
          expectedStatusMax: merged.expectedStatusMax ?? null,
          groupId: nextGroupId,
          basicAuthUsername: nextBasicAuthUsername,
          basicAuthPassword: nextBasicAuthPassword,
          dnsRecordType: merged.dnsRecordType ?? null,
          dnsExpectedValue: merged.dnsExpectedValue ?? null,
          keyword: merged.keyword ?? null,
          keywordInvert: merged.keywordInvert ?? false,
        },
      });

      const monitor = toMonitorDTO(updated);
      if (monitor.active) app.scheduler.start(monitor);
      return monitor;
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const existing = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Monitor not found" });

    app.scheduler.stop(existing.id);
    await app.prisma.monitor.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/:id/pause", async (request, reply) => {
    const existing = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Monitor not found" });

    app.scheduler.stop(existing.id);
    const updated = await app.prisma.monitor.update({
      where: { id: existing.id },
      data: { active: false },
    });

    const monitor = toMonitorDTO(updated);
    emitMonitorUpdate(app, monitor);
    return monitor;
  });

  app.post<{ Params: { id: string } }>("/:id/resume", async (request, reply) => {
    const existing = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Monitor not found" });

    const updated = await app.prisma.monitor.update({
      where: { id: existing.id },
      data: { active: true, status: "pending" },
    });

    const monitor = toMonitorDTO(updated);
    app.scheduler.start(monitor);
    emitMonitorUpdate(app, monitor);
    return monitor;
  });
};
