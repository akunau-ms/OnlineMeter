import type { FastifyPluginAsync } from "fastify";
import { toPublicStatusGroupDTO } from "../mappers.js";

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Unauthenticated status page endpoint (specs/017). The `where: { isPublic:
 * true }` filter and the narrow `select` below are the single enforcement
 * point for FR-006/FR-007 — no private group or sensitive monitor field
 * (basic-auth credentials, keyword rules, raw heartbeat messages) can reach
 * this response, since they are never selected in the first place.
 */
export const publicStatusRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => {
    const since = new Date(Date.now() - HISTORY_WINDOW_MS);

    const groups = await app.prisma.group.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        monitors: {
          select: {
            id: true,
            name: true,
            status: true,
            active: true,
            heartbeats: {
              where: { timestamp: { gte: since } },
              orderBy: { timestamp: "asc" },
              select: { timestamp: true, status: true },
            },
          },
        },
      },
    });

    return groups.map(toPublicStatusGroupDTO);
  });
};
