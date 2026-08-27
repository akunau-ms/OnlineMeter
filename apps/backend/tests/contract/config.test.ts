import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";

describe("GET /api/config (specs/021)", () => {
  it("reports demoMode: false by default", async () => {
    const ctx = await createTestApp("test-config-default");
    const res = await ctx.app.inject({ method: "GET", url: "/api/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ demoMode: false });
    await ctx.cleanup();
  });

  it("reports demoMode: true when the app was built with it", async () => {
    const ctx = await createTestApp("test-config-demo", { demoMode: true });
    const res = await ctx.app.inject({ method: "GET", url: "/api/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ demoMode: true });
    await ctx.cleanup();
  });
});
