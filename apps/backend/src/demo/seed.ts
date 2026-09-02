import type { PrismaClient } from "@prisma/client";

/**
 * Sample monitors for a fresh demo instance (specs/021 data-model.md).
 * Deliberately restricted to check types that need no special container
 * privileges — never `ping` (raw ICMP sockets) or `docker` (a mounted
 * Docker socket), either of which a public PaaS deployment is unlikely to
 * grant, which would make a seed monitor falsely look permanently "down"
 * for a reason unrelated to the product (research.md decision 5).
 */
const SEED_MONITORS = [
  { name: "GitHub", type: "http", target: "https://github.com" },
  { name: "Cloudflare DNS (1.1.1.1)", type: "tcp", target: "1.1.1.1:443" },
  {
    name: "Example Domain",
    type: "keyword",
    target: "https://example.com",
    keyword: "Example Domain",
  },
  { name: "GitHub (DNS)", type: "dns", target: "github.com", dnsRecordType: "A" },
  // Deliberately always down — httpbin.org's own status-code test endpoint
  // reliably returns 500, so the demo always has one red monitor to show
  // off the "down" state, rather than depending on a real service's
  // uncontrollable flakiness.
  { name: "Broken Endpoint (always down)", type: "http", target: "https://httpbin.org/status/500" },
] as const;

/**
 * Sample dashboard widgets (specs/027-029), keyed by the seed monitor name
 * they attach to. Picked to show off a mix of trigger types and both
 * Critical and Normal/Warning severities without depending on any real
 * service's uncontrollable flakiness — "Broken Endpoint" is the one
 * seed monitor guaranteed to stay down, same reasoning as SEED_MONITORS'
 * own comment above.
 */
const SEED_WIDGETS = [
  { monitorName: "Broken Endpoint (always down)", triggerType: "status_down" },
  {
    monitorName: "Broken Endpoint (always down)",
    triggerType: "down_duration_minutes",
    warningThreshold: 5,
    criticalThreshold: 30,
  },
  {
    monitorName: "GitHub",
    triggerType: "response_time_ms",
    warningThreshold: 500,
    criticalThreshold: 2000,
  },
  {
    monitorName: "Cloudflare DNS (1.1.1.1)",
    triggerType: "uptime_below_percent",
    warningThreshold: 99,
    criticalThreshold: 95,
  },
] as const;

/**
 * Seeds one "Demo" group and the sample monitors above, plus one sample
 * dashboard showing off the trigger/severity feature (specs/027-029), but
 * only when the database is currently empty (`Monitor` table has zero
 * rows) — never on a redeploy where real data already exists (spec.md Edge
 * Cases). Runs before `scheduler.startAllActive()` so the seeded monitors
 * are picked up by that existing call, with no separate scheduler-start
 * code here.
 */
export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const existingCount = await prisma.monitor.count();
  if (existingCount > 0) return;

  const group = await prisma.group.create({ data: { name: "Demo" } });

  const monitorIdByName = new Map<string, string>();
  for (const seed of SEED_MONITORS) {
    const created = await prisma.monitor.create({
      data: {
        name: seed.name,
        type: seed.type,
        target: seed.target,
        groupId: group.id,
        ...("keyword" in seed ? { keyword: seed.keyword } : {}),
        ...("dnsRecordType" in seed ? { dnsRecordType: seed.dnsRecordType } : {}),
      },
    });
    monitorIdByName.set(seed.name, created.id);
  }

  const dashboard = await prisma.dashboard.create({ data: { name: "Demo Dashboard" } });
  for (const [position, widget] of SEED_WIDGETS.entries()) {
    await prisma.dashboardWidget.create({
      data: {
        dashboardId: dashboard.id,
        monitorId: monitorIdByName.get(widget.monitorName)!,
        triggerType: widget.triggerType,
        warningThreshold: "warningThreshold" in widget ? widget.warningThreshold : null,
        criticalThreshold: "criticalThreshold" in widget ? widget.criticalThreshold : null,
        position,
      },
    });
  }
}
