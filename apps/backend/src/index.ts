import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { createScheduler } from "./scheduler/index.js";
import { config } from "./config.js";
import { seedDemoData } from "./demo/seed.js";

const prisma = new PrismaClient();

const app = buildApp({ prisma, createScheduler, demoMode: config.demoMode });

async function main(): Promise<void> {
  if (config.demoMode) await seedDemoData(prisma);
  await app.scheduler.startAllActive();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
