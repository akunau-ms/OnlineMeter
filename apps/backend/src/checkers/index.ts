import type { MonitorType } from "shared-types";
import type { MonitorChecker } from "./types.js";
import { httpChecker } from "./http.js";
import { tcpChecker } from "./tcp.js";
import { pingChecker } from "./ping.js";
import { dnsChecker } from "./dns.js";
import { keywordChecker } from "./keyword.js";
import { dockerChecker } from "./docker.js";

export const checkers: Record<MonitorType, MonitorChecker> = {
  http: httpChecker,
  tcp: tcpChecker,
  ping: pingChecker,
  dns: dnsChecker,
  keyword: keywordChecker,
  docker: dockerChecker,
};
