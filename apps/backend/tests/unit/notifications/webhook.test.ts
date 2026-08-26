import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webhookProvider } from "../../../src/notifications/webhook.js";
import type { NotificationPayload } from "../../../src/notifications/types.js";

const payload: NotificationPayload = {
  monitorName: "test-monitor",
  status: "down",
  timestamp: new Date().toISOString(),
};

describe("webhookProvider", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/ok") {
        res.writeHead(200);
        res.end("ok");
      } else if (req.url === "/error") {
        res.writeHead(500);
        res.end("error");
      } else if (req.url === "/slow") {
        setTimeout(() => {
          res.writeHead(200);
          res.end("slow");
        }, 500);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("returns ok:true on a 2xx response", async () => {
    const result = await webhookProvider.send(`${baseUrl}/ok`, payload);
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false with an error on a non-2xx response", async () => {
    const result = await webhookProvider.send(`${baseUrl}/error`, payload);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns ok:false with an error when the target is unreachable", async () => {
    const result = await webhookProvider.send("http://127.0.0.1:1/unreachable", payload);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns ok:false with an error on timeout, without throwing", async () => {
    const result = await webhookProvider.send(`${baseUrl}/slow`, payload, 50);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
