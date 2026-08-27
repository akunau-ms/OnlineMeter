import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app.js";
import { createScheduler } from "../../src/scheduler/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../..");

/**
 * Spins up a real Fastify app (routes + Socket.IO + scheduler) against a
 * throwaway SQLite database, migrated via `prisma db push`. Used by contract
 * and integration tests so they exercise the actual wiring, not a mock.
 */
export async function createTestApp(dbName: string, options?: { demoMode?: boolean }) {
  const dbPath = path.join(backendRoot, "prisma", `${dbName}.db`);
  for (const suffix of ["", "-journal"]) {
    if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
  }
  const databaseUrl = `file:${dbPath}`;

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "ignore",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const app = buildApp({ prisma, createScheduler, demoMode: options?.demoMode });
  await app.ready();

  return {
    app,
    prisma,
    async cleanup() {
      await app.close();
      for (const suffix of ["", "-journal"]) {
        if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
      }
    },
  };
}
