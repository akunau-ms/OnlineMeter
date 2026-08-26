declare module "ping" {
  export interface PingResponse {
    host: string;
    alive: boolean;
    time: number | "unknown";
    output: string;
  }

  export interface PingConfig {
    timeout?: number;
  }

  export interface PingModule {
    promise: {
      probe(host: string, config?: PingConfig): Promise<PingResponse>;
    };
  }

  const ping: PingModule;
  export default ping;
}
