import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import { seedDemoData } from "../../src/demo/seed.js";

describe("seedDemoData (specs/021)", () => {
  it("seeds one Demo group and 5 monitors into an empty database", async () => {
    const ctx = await createTestApp("test-demo-seed-empty");
    try {
      await seedDemoData(ctx.prisma);

      const groups = await ctx.prisma.group.findMany();
      expect(groups).toHaveLength(1);
      expect(groups[0]!.name).toBe("Demo");

      const monitors = await ctx.prisma.monitor.findMany();
      expect(monitors).toHaveLength(5);
      for (const monitor of monitors) {
        expect(monitor.groupId).toBe(groups[0]!.id);
        // FR-008: no sensitive configuration on any seeded monitor.
        expect(monitor.basicAuthUsername).toBeNull();
        expect(monitor.basicAuthPassword).toBeNull();
      }
    } finally {
      await ctx.cleanup();
    }
  });

  it("also seeds a sample dashboard showing off the trigger/severity feature (specs/027-029)", async () => {
    const ctx = await createTestApp("test-demo-seed-dashboard");
    try {
      await seedDemoData(ctx.prisma);

      const dashboards = await ctx.prisma.dashboard.findMany({
        include: { widgets: { include: { monitor: true } } },
      });
      expect(dashboards).toHaveLength(1);
      expect(dashboards[0]!.name).toBe("Demo Dashboard");
      expect(dashboards[0]!.widgets).toHaveLength(4);
      for (const widget of dashboards[0]!.widgets) {
        // Every seeded widget must reference a real, just-seeded monitor —
        // never a dangling id from a typo in SEED_WIDGETS.
        expect(widget.monitor).not.toBeNull();
      }
    } finally {
      await ctx.cleanup();
    }
  });

  it("does not duplicate seed data on a non-empty database", async () => {
    const ctx = await createTestApp("test-demo-seed-nonempty");
    try {
      await ctx.prisma.monitor.create({
        data: { name: "Pre-existing", type: "http", target: "https://example.com" },
      });

      await seedDemoData(ctx.prisma);

      const monitors = await ctx.prisma.monitor.findMany();
      expect(monitors).toHaveLength(1);
      expect(monitors[0]!.name).toBe("Pre-existing");

      const groups = await ctx.prisma.group.findMany();
      expect(groups).toHaveLength(0);
    } finally {
      await ctx.cleanup();
    }
  });
});
