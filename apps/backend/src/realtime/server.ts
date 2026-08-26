import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "shared-types";

export type AppSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function createRealtimeServer(httpServer: HttpServer): AppSocketServer {
  return new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });
}
