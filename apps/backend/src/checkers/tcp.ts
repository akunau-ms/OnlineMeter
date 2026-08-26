import net from "node:net";
import type { Monitor } from "shared-types";
import type { CheckResult, MonitorChecker } from "./types.js";

function parseHostPort(target: string): { host: string; port: number } {
  const [host, portStr] = target.split(":");
  return { host, port: Number(portStr) };
}

export const tcpChecker: MonitorChecker = {
  type: "tcp",

  check(monitor: Monitor): Promise<CheckResult> {
    const { host, port } = parseHostPort(monitor.target);
    const start = performance.now();

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result: CheckResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(monitor.timeoutSeconds * 1000);

      socket.once("connect", () => {
        finish({
          status: "up",
          responseTimeMs: Math.round(performance.now() - start),
          message: `Connected to ${host}:${port}`,
        });
      });

      socket.once("timeout", () => {
        finish({ status: "down", responseTimeMs: null, message: "Connection timed out" });
      });

      socket.once("error", (error) => {
        finish({ status: "down", responseTimeMs: null, message: error.message });
      });

      socket.connect(port, host);
    });
  },
};
