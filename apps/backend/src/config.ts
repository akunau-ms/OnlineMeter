export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  minIntervalSeconds: 20,
  // Docker monitors only (specs/006) — opt-in: the operator's deployment
  // must mount a Docker socket for this to resolve to anything reachable.
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock",
};
