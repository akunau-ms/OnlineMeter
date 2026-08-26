import type { FastifyInstance } from "fastify";
import { toMonitorDTO } from "../mappers.js";

/**
 * Sends every connecting (and reconnecting) client a full snapshot of all
 * monitors, so a client can never be left with stale/missing state after a
 * disconnect (FR-010, contracts/websocket-events.md `monitor:list`).
 */
export function registerRealtimeHandlers(app: FastifyInstance): void {
  app.io.on("connection", (socket) => {
    app.log.info({ socketId: socket.id }, "client connected");

    void app.prisma.monitor.findMany({ orderBy: { createdAt: "asc" } }).then((records) => {
      socket.emit("monitor:list", { monitors: records.map(toMonitorDTO) });
    });
  });
}
