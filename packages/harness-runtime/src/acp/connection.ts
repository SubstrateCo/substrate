import { HarnessError } from "../errors.ts";
import { launch, stopProcess } from "../process.ts";
import type { AcpLaunch, AcpProtocolVersion } from "./api.ts";
import type {
  AcpDriverConnection,
  AcpDriverHandlers,
  AcpInitializeOutcome,
  AcpTransport,
  ProtocolDriver,
} from "./driver.ts";
import { v1Driver } from "./v1/driver.ts";
import { v2Driver } from "./v2/driver.ts";
import { Readable, Writable } from "node:stream";

/** A started agent process. exited resolves with the reason once it ends. */
export interface AcpProcess {
  transport: AcpTransport;
  exited: Promise<Error>;
  stop(): Promise<void>;
}

export type AcpSpawn = (launch: AcpLaunch, cwd: string) => AcpProcess;

export interface AcpConnectDeps {
  spawn?: AcpSpawn;
  /** Replaces the registered drivers. */
  drivers?: ProtocolDriver[];
  /** Negotiated versions; defaults to the process-wide cache. */
  cache?: Map<string, AcpProtocolVersion>;
}

/** An initialized connection and the process behind it. close stops the process. */
export interface AcpLiveConnection {
  connection: AcpDriverConnection;
  close(): Promise<void>;
}

const initializeTimeoutMs = 30_000;
const registeredDrivers = new Map<AcpProtocolVersion, ProtocolDriver>([
  [1, v1Driver],
  [2, v2Driver],
]);
const negotiatedVersions = new Map<string, AcpProtocolVersion>();

/** Registers the driver for one protocol version, replacing any earlier one. */
export function registerProtocolDriver(driver: ProtocolDriver): void {
  registeredDrivers.set(driver.version, driver);
}

export function spawnAcp(agent: AcpLaunch, cwd: string): AcpProcess {
  const child = launch(agent.command, agent.args, cwd, agent.env);
  child.stderr.resume();
  const exited = new Promise<Error>((resolve) => {
    child.once("error", (error) =>
      resolve(
        new HarnessError("process-spawn", `Cannot start ${agent.harness} ACP.`, { cause: error }),
      ),
    );
    child.once("exit", (code) =>
      resolve(new HarnessError("process-exit", `${agent.harness} ACP exited with code ${code}.`)),
    );
  });
  return {
    // SAFETY: piped Node stdout emits Buffer (a Uint8Array); Node and DOM stream types differ only in ambient declarations here.
    transport: {
      output: Writable.toWeb(child.stdin),
      input: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    },
    exited,
    stop: () => stopProcess(child),
  };
}

/** Every registered driver takes part in negotiation; the agent picks the version. */
function enabledDrivers(deps: AcpConnectDeps) {
  const drivers = new Map<number, ProtocolDriver>();
  for (const driver of deps.drivers ?? registeredDrivers.values())
    drivers.set(driver.version, driver);
  return drivers;
}

// Bundled adapters share Electron's execPath, so the script in args tells them apart.
const launchKey = (agent: AcpLaunch) =>
  `launch:${[agent.command, ...agent.args].join(" ")}@${agent.version}`;

/**
 * Starts the agent and initializes it with the highest enabled version, or the version this
 * agent negotiated before. When the agent offers another version, the process restarts and
 * initialize runs again with the best version both sides speak.
 */
export async function connectAcp(
  agent: AcpLaunch,
  cwd: string,
  handlers: AcpDriverHandlers,
  signal: AbortSignal,
  deps: AcpConnectDeps = {},
): Promise<AcpLiveConnection> {
  const drivers = enabledDrivers(deps);
  const cache = deps.cache ?? negotiatedVersions;
  const spawn = deps.spawn ?? spawnAcp;
  const highest = Math.max(...drivers.keys());
  const cached = cache.get(launchKey(agent));
  let version: number = cached && drivers.has(cached) ? cached : highest;
  const tried = new Set<number>();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(initializeTimeoutMs)]);
  for (;;) {
    tried.add(version);
    const driver = drivers.get(version)!;
    const child = spawn(agent, cwd);
    let outcome: AcpInitializeOutcome;
    try {
      outcome = await Promise.race([
        driver.initialize(child.transport, handlers, bounded),
        child.exited.then((error) => Promise.reject(error)),
      ]);
    } catch (error) {
      await child.stop();
      if (bounded.aborted && !signal.aborted)
        throw new HarnessError("process-timeout", "ACP initialize timed out.", { cause: error });
      throw error;
    }
    if (outcome.type === "ready") {
      const connection = outcome.connection;
      void child.exited.then((error) => connection.close(error));
      cache.set(launchKey(agent), connection.protocolVersion);
      if (connection.agentInfo)
        cache.set(
          `agent:${connection.agentInfo.name}@${connection.agentInfo.version}`,
          connection.protocolVersion,
        );
      return {
        connection,
        close: async () => {
          connection.close();
          await child.stop();
        },
      };
    }
    await child.stop();
    const common = outcome.versions.filter(
      (offered) => drivers.has(offered) && !tried.has(offered),
    );
    if (!common.length)
      throw new HarnessError(
        "unsupported-capability",
        `${agent.harness} speaks ACP ${outcome.versions.join(", ") || "an unknown version"}; Substrate speaks ACP ${[...drivers.keys()].join(", ")}.`,
      );
    version = Math.max(...common);
  }
}
