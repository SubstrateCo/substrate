import type { AcpAuthMethod, AcpLaunch, AcpPeer, OpenAcpPeer } from "./acp/api.ts";
import type { TerminalLogin } from "./acp/terminal-login.ts";
import { createSignIns } from "./sign-in.ts";
import { describe, expect, test } from "bun:test";

const launch: AcpLaunch = { harness: "claude", command: "agent", args: [], version: "1.0.0" };

function fakePeer(methods: AcpAuthMethod[], options: { logout?: boolean } = {}) {
  const authenticated = Promise.withResolvers<void>();
  const calls: string[] = [];
  const peer: AcpPeer = {
    launch,
    protocolVersion: 1,
    capabilities: {
      loadSession: false,
      resume: false,
      close: false,
      delete: false,
      sessionOptions: false,
      systemPrompt: { append: false, override: false },
      mcp: { http: false, stdio: false, acp: false },
      steering: "none",
      logout: options.logout ?? false,
      authStatus: false,
    },
    authMethods: methods,
    probeConfigOptions: async () => [],
    authenticate: async (methodId: string) => {
      calls.push(`authenticate:${methodId}`);
      await authenticated.promise;
    },
    logout: async () => {
      calls.push("logout");
    },
    close: async () => {
      calls.push("close");
    },
  };
  const openPeer: OpenAcpPeer = async () => peer;
  return { openPeer, calls, authenticated };
}

function manualTerminal() {
  let onOutput: (text: string) => void = () => {};
  const exit = Promise.withResolvers<boolean>();
  const lines: string[] = [];
  const login: TerminalLogin = {
    write: (line) => void lines.push(line),
    cancel: async () => exit.resolve(false),
    done: exit.promise,
  };
  return {
    // SAFETY: the fake honours the parameters sign-in passes; it never spawns a process.
    start: ((_launch, _method, options) => {
      onOutput = options.onOutput;
      return login;
    }) as Parameters<typeof createSignIns>[0]["startTerminal"],
    print: (text: string) => onOutput(text),
    exit,
    lines,
  };
}

const agentMethod: AcpAuthMethod = { id: "oauth", name: "Claude account", type: "agent" };
const terminalMethod: AcpAuthMethod = {
  id: "login",
  name: "Log in",
  type: "terminal",
  args: ["/login"],
};

describe("native sign-in", () => {
  test("an agent method runs authenticate and reports success", async () => {
    const peer = fakePeer([agentMethod]);
    const signIns = createSignIns({
      cwd: ".",
      openPeer: peer.openPeer,
      requireAgent: async () => launch,
    });
    const started = await signIns.start({ harness: "claude", methodId: "oauth" });
    expect(started).toMatchObject({ type: "agent", status: "running" });
    peer.authenticated.resolve();
    await Bun.sleep(0);
    expect(signIns.read({ loginId: started.loginId, cursor: 0 }).status).toBe("succeeded");
    expect(peer.calls).toEqual(["authenticate:oauth", "close"]);
  });

  test("rejects a method the agent does not advertise", async () => {
    const peer = fakePeer([agentMethod]);
    const signIns = createSignIns({
      cwd: ".",
      openPeer: peer.openPeer,
      requireAgent: async () => launch,
    });
    expect(signIns.start({ harness: "claude", methodId: "made-up" })).rejects.toThrow();
  });

  test("terminal output reads from a cursor and input reaches the command", async () => {
    const terminal = manualTerminal();
    const signIns = createSignIns({
      cwd: ".",
      openPeer: fakePeer([terminalMethod]).openPeer,
      requireAgent: async () => launch,
      startTerminal: terminal.start,
    });
    const { loginId } = await signIns.start({ harness: "claude", methodId: "login" });
    terminal.print("Open https://claude.ai/x\n");
    const first = signIns.read({ loginId, cursor: 0 });
    terminal.print("Code: ");
    expect(signIns.read({ loginId, cursor: first.cursor }).output).toBe("Code: ");
    signIns.write({ loginId, text: "123-456" });
    expect(terminal.lines).toEqual(["123-456"]);
    terminal.exit.resolve(true);
    await Bun.sleep(0);
    expect(signIns.read({ loginId, cursor: 0 }).status).toBe("succeeded");
    expect(() => signIns.write({ loginId, text: "late" })).toThrow();
  });

  test("cancel ends a running sign-in as cancelled", async () => {
    const terminal = manualTerminal();
    const signIns = createSignIns({
      cwd: ".",
      openPeer: fakePeer([terminalMethod]).openPeer,
      requireAgent: async () => launch,
      startTerminal: terminal.start,
    });
    const { loginId } = await signIns.start({ harness: "claude", methodId: "login" });
    await signIns.cancel({ loginId });
    await Bun.sleep(0);
    expect(signIns.read({ loginId, cursor: 0 }).status).toBe("cancelled");
  });

  test("sign-out requires the agent's logout capability", async () => {
    const without = fakePeer([agentMethod]);
    const signIns = createSignIns({
      cwd: ".",
      openPeer: without.openPeer,
      requireAgent: async () => launch,
    });
    expect(signIns.signOut({ harness: "claude" })).rejects.toThrow();
    const withLogout = fakePeer([agentMethod], { logout: true });
    await createSignIns({
      cwd: ".",
      openPeer: withLogout.openPeer,
      requireAgent: async () => launch,
    }).signOut({ harness: "claude" });
    expect(withLogout.calls).toEqual(["logout", "close"]);
  });
});
