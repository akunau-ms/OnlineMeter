import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

describe("monitors REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await createTestApp("test-monitors-contract");
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("GET /api/monitors starts empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/monitors" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/monitors creates a monitor with defaults applied", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "example", type: "http", target: "https://example.com" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");
    expect(body.intervalSeconds).toBe(60);
    expect(body.timeoutSeconds).toBe(48);
    expect(body.expectedStatusMin).toBe(200);
    expect(body.expectedStatusMax).toBe(299);
  });

  it("POST /api/monitors rejects an invalid target with 400 and creates nothing", async () => {
    const before = await app.inject({ method: "GET", url: "/api/monitors" });
    const countBefore = before.json().length;

    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "bad", type: "http", target: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.json())).toBe(true);

    const after = await app.inject({ method: "GET", url: "/api/monitors" });
    expect(after.json().length).toBe(countBefore);
  });

  it("GET/PUT/DELETE /api/monitors/:id round-trip", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "roundtrip", type: "tcp", target: "example.com:443" },
    });
    const id = created.json().id;

    const got = await app.inject({ method: "GET", url: `/api/monitors/${id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().name).toBe("roundtrip");

    const updated = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { name: "renamed" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("renamed");

    const rejectedTypeChange = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { type: "http" },
    });
    expect(rejectedTypeChange.statusCode).toBe(400);

    const deleted = await app.inject({ method: "DELETE", url: `/api/monitors/${id}` });
    expect(deleted.statusCode).toBe(204);

    const gone = await app.inject({ method: "GET", url: `/api/monitors/${id}` });
    expect(gone.statusCode).toBe(404);
  });

  it("returns 404 for an unknown monitor id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/monitors/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/monitors embeds each monitor's recentHeartbeats, bounded to 20, in chronological order", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "history-embed", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    // A monitor with no heartbeats yet must report an empty array, not an error.
    const freshList = await app.inject({ method: "GET", url: "/api/monitors" });
    const freshEntry = freshList.json().find((m: { id: string }) => m.id === id);
    expect(freshEntry.recentHeartbeats).toEqual([]);

    for (let i = 0; i < 25; i++) {
      await prisma.heartbeat.create({
        data: { monitorId: id, status: "up", responseTimeMs: i, message: `check ${i}` },
      });
    }

    const list = await app.inject({ method: "GET", url: "/api/monitors" });
    const entry = list.json().find((m: { id: string }) => m.id === id);
    expect(entry.recentHeartbeats).toHaveLength(20);
    // Chronological: the last-created heartbeat (message "check 24") is last in the array.
    expect(entry.recentHeartbeats[19].message).toBe("check 24");
    expect(entry.recentHeartbeats[0].message).toBe("check 5");
  });

  it("POST /api/monitors accepts a valid groupId", async () => {
    const group = await app.inject({ method: "POST", url: "/api/groups", payload: { name: "G" } });
    const groupId = group.json().id;

    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "in-group", type: "http", target: "https://example.com", groupId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().groupId).toBe(groupId);
  });

  it("POST/PUT /api/monitors rejects an unknown groupId with 400", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: {
        name: "bad-group",
        type: "http",
        target: "https://example.com",
        groupId: "does-not-exist",
      },
    });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().some((e: { field: string }) => e.field === "groupId")).toBe(true);

    const existing = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "regroup-me", type: "http", target: "https://example.com" },
    });
    const id = existing.json().id;

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { groupId: "does-not-exist" },
    });
    expect(putRes.statusCode).toBe(400);
  });

  it("rejects Basic Auth fields on non-HTTP monitors with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: {
        name: "tcp-with-auth",
        type: "tcp",
        target: "example.com:443",
        basicAuthUsername: "alice",
        basicAuthPassword: "s3cret",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().some((e: { field: string }) => e.field === "basicAuthUsername")).toBe(true);
  });

  it("PUT partial-update semantics for basicAuthUsername/basicAuthPassword: omit=unchanged, null=clear, string=set", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: {
        name: "auth-monitor",
        type: "http",
        target: "https://example.com",
        basicAuthUsername: "alice",
        basicAuthPassword: "s3cret",
      },
    });
    const id = created.json().id;
    expect(created.json().basicAuthUsername).toBe("alice");

    // Omitted entirely -> unchanged.
    const untouched = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { name: "auth-monitor-renamed" },
    });
    expect(untouched.statusCode).toBe(200);
    expect(untouched.json().basicAuthUsername).toBe("alice");

    // Explicit null -> cleared.
    const cleared = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { basicAuthUsername: null, basicAuthPassword: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().basicAuthUsername).toBeNull();

    // Explicit string -> set.
    const reset = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { basicAuthUsername: "bob", basicAuthPassword: "newpass" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().basicAuthUsername).toBe("bob");
  });

  it("never includes basicAuthPassword in GET /api/monitors or GET /api/monitors/:id, even when set", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: {
        name: "no-leak",
        type: "http",
        target: "https://example.com",
        basicAuthUsername: "alice",
        basicAuthPassword: "s3cret",
      },
    });
    const id = created.json().id;
    expect(JSON.stringify(created.json())).not.toContain("basicAuthPassword");

    const list = await app.inject({ method: "GET", url: "/api/monitors" });
    expect(list.body).not.toContain("basicAuthPassword");

    const single = await app.inject({ method: "GET", url: `/api/monitors/${id}` });
    expect(single.body).not.toContain("basicAuthPassword");
  });

  it("POST /api/monitors accepts a DNS monitor with a record type and optional expected value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "dns-check", type: "dns", target: "example.com", dnsRecordType: "A" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().dnsRecordType).toBe("A");
    expect(res.json().dnsExpectedValue).toBeNull();
  });

  it("POST /api/monitors rejects a DNS monitor with an unsupported record type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "bad-record", type: "dns", target: "example.com", dnsRecordType: "SRV" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().some((e: { field: string }) => e.field === "dnsRecordType")).toBe(true);
  });

  it("POST /api/monitors rejects a DNS monitor missing a record type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "no-record-type", type: "dns", target: "example.com" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().some((e: { field: string }) => e.field === "dnsRecordType")).toBe(true);
  });

  it("PUT /api/monitors/:id rejects DNS fields on a non-DNS monitor", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "plain-http", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: "PUT",
      url: `/api/monitors/${id}`,
      payload: { dnsRecordType: "A" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/monitors accepts a keyword monitor with keyword, keywordInvert, and Basic Auth fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: {
        name: "keyword-check",
        type: "keyword",
        target: "https://example.com",
        keyword: "Example",
        keywordInvert: true,
        basicAuthUsername: "alice",
        basicAuthPassword: "s3cret",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().keyword).toBe("Example");
    expect(res.json().keywordInvert).toBe(true);
    expect(res.json().basicAuthUsername).toBe("alice");
  });

  it("POST /api/monitors rejects a keyword monitor missing a keyword", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "no-keyword", type: "keyword", target: "https://example.com" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().some((e: { field: string }) => e.field === "keyword")).toBe(true);
  });

  it("GET /api/monitors and GET /api/monitors/:id expose certificateExpiresAt/certificateExpiringSoon, null/false before any check has completed", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "cert-check", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;
    expect(created.json().certificateExpiresAt).toBeNull();
    expect(created.json().certificateExpiringSoon).toBe(false);

    const single = await app.inject({ method: "GET", url: `/api/monitors/${id}` });
    expect(single.json().certificateExpiresAt).toBeNull();
    expect(single.json().certificateExpiringSoon).toBe(false);

    const list = await app.inject({ method: "GET", url: "/api/monitors" });
    const entry = list.json().find((m: { id: string }) => m.id === id);
    expect(entry.certificateExpiresAt).toBeNull();
    expect(entry.certificateExpiringSoon).toBe(false);
  });

  it("GET /api/monitors/:id reports no certificate data for a non-HTTP(S) monitor", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "tcp-no-cert", type: "tcp", target: "example.com:443" },
    });
    const single = await app.inject({ method: "GET", url: `/api/monitors/${created.json().id}` });
    expect(single.json().certificateExpiresAt).toBeNull();
    expect(single.json().certificateExpiringSoon).toBe(false);
  });
});
