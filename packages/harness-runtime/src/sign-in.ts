import type {
  HarnessKind,
  HarnessSignInState,
  HarnessSignInStatus,
} from "@substrate/contracts/harness-runtime";

import type { AcpLaunch, AcpPeer, OpenAcpPeer } from "./acp/api.ts";
import { startTerminalLogin, type TerminalLogin } from "./acp/terminal-login.ts";
import { HarnessError } from "./errors.ts";
import { randomUUID } from "node:crypto";

/** Output kept per sign-in. Older text is dropped; cursors still count it. */
const outputLimit = 64 * 1024;
/** Each read returns at most this much text. */
const readLimit = 32 * 1024;
/** An agent sign-in or sign-out that runs this long is stopped. */
const agentTimeoutMs = 10 * 60_000;
const signOutTimeoutMs = 60_000;

interface Login {
  id: string;
  harness: HarnessKind;
  type: "agent" | "terminal";
  status: HarnessSignInStatus;
  /** Retained output; text before dropped was removed. */
  output: string;
  dropped: number;
  terminal?: TerminalLogin;
  abort: AbortController;
}

export interface SignInOptions {
  /** The directory the agent starts in for sign-in. */
  cwd: string;
  openPeer: OpenAcpPeer;
  requireAgent: (harness: HarnessKind) => Promise<AcpLaunch>;
  /** Test seam for terminal logins. */
  startTerminal?: typeof startTerminalLogin;
}

/** Starts and tracks sign-ins to native agents. One sign-in per harness at a time. */
export function createSignIns(options: SignInOptions) {
  const logins = new Map<HarnessKind, Login>();
  const startTerminal = options.startTerminal ?? startTerminalLogin;

  function state(login: Login, cursor = 0): HarnessSignInState {
    const end = login.dropped + login.output.length;
    const start = Math.min(Math.max(cursor, login.dropped), end);
    const output = login.output.slice(start - login.dropped, start - login.dropped + readLimit);
    return {
      loginId: login.id,
      harness: login.harness,
      type: login.type,
      status: login.status,
      output,
      cursor: start + output.length,
    };
  }

  function append(login: Login, text: string) {
    login.output += text;
    const excess = login.output.length - outputLimit;
    if (excess > 0) {
      login.output = login.output.slice(excess);
      login.dropped += excess;
    }
  }

  function finish(login: Login, status: HarnessSignInStatus) {
    if (login.status === "running") login.status = status;
  }

  function find(loginId: string) {
    for (const login of logins.values()) if (login.id === loginId) return login;
    throw new HarnessError("unknown-request", "That sign-in is not known.");
  }

  async function stop(login: Login) {
    finish(login, "cancelled");
    login.abort.abort();
    await login.terminal?.cancel();
  }

  async function withPeer<T>(
    harness: HarnessKind,
    signal: AbortSignal,
    run: (peer: AcpPeer) => Promise<T>,
  ) {
    const peer = await options.openPeer(await options.requireAgent(harness), {
      cwd: options.cwd,
      signal,
    });
    try {
      return await run(peer);
    } finally {
      await peer.close().catch(() => {});
    }
  }

  return {
    async start(input: { harness: HarnessKind; methodId: string }): Promise<HarnessSignInState> {
      const previous = logins.get(input.harness);
      if (previous) await stop(previous);
      const abort = new AbortController();
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(agentTimeoutMs)]);
      const launch = await options.requireAgent(input.harness);
      const peer = await options.openPeer(launch, { cwd: options.cwd, signal });
      const method = peer.authMethods.find((entry) => entry.id === input.methodId);
      if (!method) {
        await peer.close().catch(() => {});
        throw new HarnessError("unsupported-capability", "The agent does not offer that sign-in.");
      }
      const login: Login = {
        id: randomUUID(),
        harness: input.harness,
        type: method.type,
        status: "running",
        output: "",
        dropped: 0,
        abort,
      };
      if (method.type === "agent") {
        logins.set(input.harness, login);
        void peer
          .authenticate(method.id, signal)
          .then(
            () => finish(login, "succeeded"),
            () => finish(login, signal.aborted ? "cancelled" : "failed"),
          )
          .finally(() => peer.close().catch(() => {}));
        return state(login);
      }
      // The login command is the agent's own launch with the method's arguments.
      await peer.close().catch(() => {});
      login.terminal = startTerminal(launch, method, {
        cwd: options.cwd,
        onOutput: (text) => append(login, text),
      });
      logins.set(input.harness, login);
      void login.terminal.done.then((succeeded) =>
        finish(login, succeeded ? "succeeded" : "failed"),
      );
      return state(login);
    },
    read(input: { loginId: string; cursor: number }): HarnessSignInState {
      return state(find(input.loginId), input.cursor);
    },
    write(input: { loginId: string; text: string }) {
      const login = find(input.loginId);
      if (login.status !== "running" || !login.terminal)
        throw new HarnessError("process-write", "This sign-in does not take input.");
      login.terminal.write(input.text);
    },
    async cancel(input: { loginId: string }) {
      await stop(find(input.loginId));
    },
    async signOut(input: { harness: HarnessKind }) {
      const signal = AbortSignal.timeout(signOutTimeoutMs);
      await withPeer(input.harness, signal, async (peer) => {
        if (!peer.capabilities.logout)
          throw new HarnessError("unsupported-capability", "This agent cannot sign out.");
        await peer.logout(signal);
      });
    },
    async dispose() {
      await Promise.allSettled([...logins.values()].map(stop));
      logins.clear();
    },
  };
}

export type SignIns = ReturnType<typeof createSignIns>;
