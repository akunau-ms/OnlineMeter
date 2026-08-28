import type { FastifyPluginAsync } from "fastify";
import type { HeartbeatRange, ValidationFieldError } from "shared-types";
import { toHeartbeatDTO } from "../mappers.js";

const RANGE_MS: Record<HeartbeatRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function isRange(value: unknown): value is HeartbeatRange {
  return typeof value === "string" && value in RANGE_MS;
}

/**
 * Validates an optional custom `from`/`to` window (specs/025). Returns
 * the parsed window, or a list of field errors if either date is
 * malformed or `from` is after `to`. Deliberately does NOT reject a
 * window that lies entirely in the future — that's a client-side-only
 * UX guard (research.md decision 3); a future-only window here just
 * yields an empty, valid result set.
 */
function parseCustomRange(
  fromParam: string | undefined,
  toParam: string | undefined,
): { from: Date; to: Date } | ValidationFieldError[] | undefined {
  if (!fromParam && !toParam) return undefined; // no custom range requested — caller falls back to `range`

  const errors: ValidationFieldError[] = [];

  const from = fromParam ? new Date(fromParam) : undefined;
  if (fromParam && (!from || Number.isNaN(from.getTime()))) {
    errors.push({ field: "from", message: "Must be a valid date" });
  }

  const to = toParam ? new Date(toParam) : undefined;
  if (toParam && (!to || Number.isNaN(to.getTime()))) {
    errors.push({ field: "to", message: "Must be a valid date" });
  }

  if (errors.length > 0) return errors;
  if (!from || !to) return undefined; // only one of the two given — not a usable custom range

  if (from.getTime() > to.getTime()) {
    return [{ field: "to", message: 'Must not be before "from"' }];
  }

  return { from, to };
}

export const heartbeatRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string }; Querystring: { range?: string; from?: string; to?: string } }>(
    "/:id/heartbeats",
    async (request, reply) => {
      const monitor = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
      if (!monitor) return reply.status(404).send({ error: "Monitor not found" });

      const customRange = parseCustomRange(request.query.from, request.query.to);
      if (Array.isArray(customRange)) return reply.status(400).send(customRange);

      let since: Date;
      let until: Date | undefined;
      if (customRange) {
        since = customRange.from;
        until = customRange.to;
      } else {
        const range: HeartbeatRange = isRange(request.query.range) ? request.query.range : "24h";
        since = new Date(Date.now() - RANGE_MS[range]);
      }

      const heartbeats = await app.prisma.heartbeat.findMany({
        where: {
          monitorId: monitor.id,
          timestamp: until ? { gte: since, lte: until } : { gte: since },
        },
        orderBy: { timestamp: "asc" },
      });

      return heartbeats.map(toHeartbeatDTO);
    },
  );
};
