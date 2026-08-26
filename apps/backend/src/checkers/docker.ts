import http from "node:http";
import { config } from "../config.js";
import type { CheckResult, CheckableMonitor, MonitorChecker } from "./types.js";

interface DockerRequestResult {
  statusCode: number;
  body: string;
}

interface ContainerInspect {
  State?: {
    Running?: boolean;
    Status?: string;
    Health?: { Status?: string };
  };
}

/**
 * Talks to the Docker Engine API directly over its Unix socket — no
 * client library, no CLI binary in this project's own image (specs/006
 * research.md decision 3).
 */
export function requestDockerApi(path: string, timeoutMs: number): Promise<DockerRequestResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: config.dockerSocketPath, path, method: "GET", timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
      },
    );
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("Docker socket request timed out")));
    req.end();
  });
}

const SOCKET_ERROR_CODES = new Set(["ENOENT", "ECONNREFUSED", "EACCES"]);

/** Distinguishes "the socket itself is unreachable" from any other failure (FR-011). */
export function isDockerSocketError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return Boolean(code && SOCKET_ERROR_CODES.has(code));
}

/**
 * Lightweight reachability probe, used both by the checker's own error
 * classification and by the create/edit route so an operator learns the
 * socket is unreachable immediately (FR-011) rather than only after the
 * first scheduled check.
 */
export async function probeDockerSocket(timeoutMs = 2000): Promise<{ reachable: boolean; message?: string }> {
  try {
    await requestDockerApi("/_ping", timeoutMs);
    return { reachable: true };
  } catch (error) {
    if (isDockerSocketError(error)) {
      return {
        reachable: false,
        message: `Docker socket not accessible at ${config.dockerSocketPath} — see quickstart.md`,
      };
    }
    // Reached the socket but got some other error on /_ping — treat as
    // reachable; a real per-container check will surface anything else.
    return { reachable: true };
  }
}

export const dockerChecker: MonitorChecker = {
  type: "docker",

  async check(monitor: CheckableMonitor): Promise<CheckResult> {
    const containerName = monitor.target;
    const start = performance.now();

    try {
      const { statusCode, body } = await requestDockerApi(
        `/containers/${encodeURIComponent(containerName)}/json`,
        monitor.timeoutSeconds * 1000,
      );
      const responseTimeMs = Math.round(performance.now() - start);

      if (statusCode === 404) {
        return { status: "down", responseTimeMs, message: `Container '${containerName}' not found` };
      }
      if (statusCode !== 200) {
        return { status: "down", responseTimeMs, message: `Docker API returned ${statusCode}` };
      }

      const info = JSON.parse(body) as ContainerInspect;
      const running = info.State?.Running ?? false;
      const health = info.State?.Health?.Status;

      if (!running) {
        return {
          status: "down",
          responseTimeMs,
          message: `Container '${containerName}' is not running (${info.State?.Status ?? "unknown"})`,
        };
      }
      if (health && health !== "healthy") {
        return {
          status: "down",
          responseTimeMs,
          message: `Container '${containerName}' is unhealthy (${health})`,
        };
      }
      return { status: "up", responseTimeMs, message: `Container '${containerName}' is running` };
    } catch (error) {
      const responseTimeMs = Math.round(performance.now() - start);
      if (isDockerSocketError(error)) {
        return {
          status: "down",
          responseTimeMs,
          message: `Docker socket not accessible at ${config.dockerSocketPath}`,
        };
      }
      const message = error instanceof Error ? error.message : "Docker check failed";
      return { status: "down", responseTimeMs, message };
    }
  },
};
