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
 * Seeds one "Demo" group and the sample monitors above, but only when the
 * database is currently empty (`Monitor` table has zero rows) — never on
 * a redeploy where real data already exists (spec.md Edge Cases). Runs
 * before `scheduler.startAllActive()` so the seeded monitors are picked
 * up by that existing call, with no separate scheduler-start code here.
 */
export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const existingCount = await prisma.monitor.count();
  if (existingCount > 0) return;

  const group = await prisma.group.create({ data: { name: "Demo" } });

  for (const seed of SEED_MONITORS) {
    await prisma.monitor.create({
      data: {
        name: seed.name,
        type: seed.type,
        target: seed.target,
        groupId: group.id,
        ...("keyword" in seed ? { keyword: seed.keyword } : {}),
        ...("dnsRecordType" in seed ? { dnsRecordType: seed.dnsRecordType } : {}),
      },
    });
  }
}
