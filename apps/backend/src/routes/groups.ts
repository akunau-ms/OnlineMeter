import type { FastifyPluginAsync } from "fastify";
import type { GroupInput } from "shared-types";
import { toGroupDTO } from "../mappers.js";

function validateGroupInput(input: Partial<GroupInput>): { field: string; message: string }[] {
  if (!input.name || !input.name.trim()) {
    return [{ field: "name", message: "Name must not be empty" }];
  }
  return [];
}

export const groupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const groups = await app.prisma.group.findMany({ orderBy: { createdAt: "asc" } });
    return groups.map(toGroupDTO);
  });

  app.post<{ Body: Partial<GroupInput> }>("/", async (request, reply) => {
    const errors = validateGroupInput(request.body);
    if (errors.length > 0) return reply.status(400).send(errors);

    const created = await app.prisma.group.create({ data: { name: request.body.name! } });
    return reply.status(201).send(toGroupDTO(created));
  });

  app.put<{ Params: { id: string }; Body: Partial<GroupInput> }>("/:id", async (request, reply) => {
    const existing = await app.prisma.group.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Group not found" });

    const errors = validateGroupInput(request.body);
    if (errors.length > 0) return reply.status(400).send(errors);

    const updated = await app.prisma.group.update({
      where: { id: existing.id },
      data: {
        name: request.body.name!,
        ...(request.body.isPublic !== undefined ? { isPublic: request.body.isPublic } : {}),
      },
    });
    return toGroupDTO(updated);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const existing = await app.prisma.group.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Group not found" });

    // Monitor.groupId has onDelete: SetNull (schema.prisma) — deleting the
    // group here never touches the monitors that referenced it (FR-011).
    await app.prisma.group.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  });
};
