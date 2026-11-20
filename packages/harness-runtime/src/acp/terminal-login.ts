import { HarnessError } from "../errors.ts";
import { launch, stopProcess, type NativeProcess } from "../process.ts";
import type { AcpAuthMethod, AcpLaunch } from "./api.ts";

/** A terminal login that does not finish in this time is stopped. */
const loginTimeoutMs = 15 * 60_000;

/**
 * Environment keys a login method may not set: they change which program or library loads, or
 * where network traffic and TLS trust go.
 */
const blockedEnvironment = [
  /^PATH$/,
  /^PATHEXT$/,
  /^COMSPEC$/,
  /^SYSTEMROOT$/,
  /^LD_/,
  /^DYLD_/,
  /^NODE_OPTIONS$/,
  /^NODE_PATH$/,
  /^NODE_EXTRA_CA_CERTS$/,
  /^NODE_TLS_REJECT_UNAUTHORIZED$/,
  /^ELECTRON_/,
  /_PROXY$/,
  /^SSL_/,
  /^CURL_CA_BUNDLE$/,
  /^REQUESTS_CA_BUNDLE$/,
];

/** True when a login method may set this environment key. */
export function allowedLoginEnvironmentKey(key: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return false;
  const upper = key.toUpperCase();
  return !blockedEnvironment.some((pattern) => pattern.test(upper));
}

/** The method's environment. Throws when it sets a blocked key. */
export function loginEnvironment(method: Pick<AcpAuthMethod, "env">) {
  const env = method.env ?? {};
  for (const key of Object.keys(env))
    if (!allowedLoginEnvironmentKey(key))
      throw new HarnessError(
        "invalid-config",
        "The sign-in method sets an environment variable Substrate does not allow.",
      );
  return { ...env };
}

// CSI, OSC (BEL or ST terminated), and single-character escapes.
// oxlint-disable-next-line no-control-regex -- terminal escapes are control characters.
const ansiPattern = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
// oxlint-disable-next-line no-control-regex -- other control characters except tab and newline.
const controlPattern = /[\x00-\x08\x0b-\x1f\x7f]/g;

/** Terminal output as plain text: no escapes, carriage returns as new lines. */
export function stripAnsi(text: string): string {
  return text.replace(ansiPattern, "").replace(/\r\n?/g, "\n").replace(controlPattern, "");
}

export interface TerminalLogin {
  /** Sends one line to the login command's standard input. */
  write(line: string): void;
  /** Stops the login command. done then resolves to false. */
  cancel(): Promise<void>;
  /** true when the login command exits with code 0. */
  done: Promise<boolean>;
}

/**
 * Runs the agent's terminal sign-in: the same launch with the method's arguments appended and its
 * environment applied. shell:false, every argument separate. Output reaches onOutput without ANSI
 * escapes, from stdout and stderr.
 */
export function startTerminalLogin(
  agent: AcpLaunch,
  method: AcpAuthMethod,
  options: {
    cwd: string;
    onOutput: (text: string) => void;
    timeoutMs?: number;
  },
): TerminalLogin {
  if (method.type !== "terminal")
    throw new HarnessError(
      "unsupported-capability",
      "This sign-in method is not a terminal login.",
    );
  const args = method.args ?? [];
  if (args.some((arg) => arg.includes("\0")))
    throw new HarnessError("invalid-config", "The sign-in method has invalid arguments.");
  const env = { ...loginEnvironment(method), ...agent.env };
  let child: NativeProcess;
  try {
    child = launch(agent.command, [...agent.args, ...args], options.cwd, env);
  } catch (cause) {
    throw new HarnessError("process-spawn", "Cannot start the sign-in command.", { cause });
  }
  let cancelled = false;
  const decoders = [new TextDecoder(), new TextDecoder()];
  const forward = (index: number) => (chunk: Buffer) => {
    const text = stripAnsi(decoders[index]!.decode(chunk, { stream: true }));
    if (text) options.onOutput(text);
  };
  child.stdout.on("data", forward(0));
  child.stderr.on("data", forward(1));
  // A closed pipe after exit must not crash the worker.
  child.stdin.on("error", () => {});
  const done = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      cancelled = true;
      void stopProcess(child);
    }, options.timeoutMs ?? loginTimeoutMs);
    timer.unref();
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(!cancelled && code === 0);
    });
  });
  return {
    write(line) {
      if (/[\r\n\0]/.test(line))
        throw new HarnessError("INVALID_INPUT", "Send one line at a time.");
      if (!child.stdin.writable)
        throw new HarnessError("process-write", "The sign-in command is not reading input.");
      child.stdin.write(`${line}\n`);
    },
    async cancel() {
      cancelled = true;
      await stopProcess(child);
    },
    done,
  };
}
