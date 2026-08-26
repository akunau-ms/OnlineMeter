import ping from "ping";
import type { Monitor } from "shared-types";
import type { CheckResult, MonitorChecker } from "./types.js";

const pingProbe = ping.promise;

// Uses the `ping` npm package, which shells out to the OS `ping` binary
// rather than opening a raw ICMP socket, so it works unprivileged in
// standard Docker images (research.md decision 4).
export const pingChecker: MonitorChecker = {
  type: "ping",

  async check(monitor: Monitor): Promise<CheckResult> {
    try {
      const result = await pingProbe.probe(monitor.target, {
        timeout: monitor.timeoutSeconds,
      });

      if (result.alive) {
        const responseTimeMs =
          typeof result.time === "number" ? Math.round(result.time) : null;
        return { status: "up", responseTimeMs, message: "Host is reachable" };
      }
      return { status: "down", responseTimeMs: null, message: "Host is unreachable" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ping failed";
      return { status: "down", responseTimeMs: null, message };
    }
  },
};
