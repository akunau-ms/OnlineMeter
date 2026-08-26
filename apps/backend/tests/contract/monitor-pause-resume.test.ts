import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";

describe("monitor pause/resume contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    ctx = await createTestApp("test-pause-resume-contract");
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("pauses an active monitor, stopping scheduling without changing status", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "pausable", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;
    expect(app.scheduler.isScheduled(id)).toBe(true);

    const res = await app.inject({ method: "POST", url: `/api/monitors/${id}/pause` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.active).toBe(false);
    expect(body.status).toBe("pending");
    expect(app.scheduler.isScheduled(id)).toBe(false);
  });

  it("resumes a paused monitor, restarting scheduling and resetting status to pending", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "resumable", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;
    await app.inject({ method: "POST", url: `/api/monitors/${id}/pause` });

    const res = await app.inject({ method: "POST", url: `/api/monitors/${id}/resume` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.active).toBe(true);
    expect(body.status).toBe("pending");
    expect(app.scheduler.isScheduled(id)).toBe(true);
  });

  it("returns 404 pausing/resuming an unknown monitor", async () => {
    const pauseRes = await app.inject({ method: "POST", url: "/api/monitors/nope/pause" });
    expect(pauseRes.statusCode).toBe(404);
    const resumeRes = await app.inject({ method: "POST", url: "/api/monitors/nope/resume" });
    expect(resumeRes.statusCode).toBe(404);
  });
});
