import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "shared-types";

/**
 * Lets the frontend know whether it's talking to a read-only demo
 * instance (specs/021) — the same built frontend image is used for both
 * demo and normal deployments, so this has to be a runtime call, not a
 * build-time flag (research.md decision 3).
 */
export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (): Promise<AppConfig> => ({ demoMode: app.demoMode }));
};
