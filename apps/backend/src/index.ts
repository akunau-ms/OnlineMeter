import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { createScheduler } from "./scheduler/index.js";
import { config } from "./config.js";

const prisma = new PrismaClient();

const app = buildApp({ prisma, createScheduler });

async function main(): Promise<void> {
  await app.scheduler.startAllActive();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
