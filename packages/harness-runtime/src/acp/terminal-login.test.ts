import type { AcpAuthMethod, AcpLaunch } from "./api.ts";
import {
  allowedLoginEnvironmentKey,
  loginEnvironment,
  startTerminalLogin,
  stripAnsi,
} from "./terminal-login.ts";
import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

// The launch runs a script with Bun; the method's arguments follow the script's own.
const script = `
const [mode, ...rest] = process.argv.slice(1);
if (mode === "argv") { console.log(JSON.stringify(rest)); process.exit(0); }
if (mode === "env") { console.log(process.env.LOGIN_REGION ?? "none"); process.exit(0); }
if (mode === "fail") { console.error("\\u001b[31mdenied\\u001b[0m"); process.exit(3); }
if (mode === "code") {
  console.log("Open https://example.com/device and paste the code:");
  for await (const line of console) { process.exit(line === "123-456" ? 0 : 1); }
}
if (mode === "hang") setInterval(() => {}, 1000);
`;
const launch: AcpLaunch = {
  harness: "claude",
  command: process.execPath,
  args: ["-e", script],
  version: "1.0.0",
};
const method = (args: string[], env?: Record<string, string>): AcpAuthMethod => ({
  id: "login",
  name: "Log in",
  type: "terminal",
  args,
  env,
});

function run(args: string[], env?: Record<string, string>) {
  const chunks: string[] = [];
  const login = startTerminalLogin(launch, method(args, env), {
    cwd: tmpdir(),
    onOutput: (text) => chunks.push(text),
  });
  return { login, output: () => chunks.join("") };
}

describe("terminal login environment", () => {
  test("refuses keys that change program lookup, loading, proxies, or TLS trust", () => {
    for (const key of [
      "PATH",
      "Path",
      "LD_PRELOAD",
      "DYLD_INSERT_LIBRARIES",
      "NODE_OPTIONS",
      "NODE_EXTRA_CA_CERTS",
      "HTTPS_PROXY",
      "all_proxy",
      "SSL_CERT_FILE",
      "ELECTRON_RUN_AS_NODE",
      "BAD-KEY",
    ])
      expect(allowedLoginEnvironmentKey(key)).toBe(false);
    expect(allowedLoginEnvironmentKey("CLAUDE_CONFIG_DIR")).toBe(true);
  });

  test("a method that sets a refused key does not start", () => {
    expect(() => loginEnvironment(method([], { NODE_OPTIONS: "--require x" }))).toThrow();
    expect(() => run(["argv"], { PATH: "/tmp" })).toThrow();
  });
});

describe("terminal output", () => {
  test("strips colour, cursor, and hyperlink escapes and keeps the text", () => {
    expect(
      stripAnsi(
        "\u001b[1;32mDone\u001b[0m\r\n\u001b]8;;https://a.test\u0007link\u001b]8;;\u0007\u001b[2K\rnext",
      ),
    ).toBe("Done\nlink\nnext");
  });
});

describe("terminal login process", () => {
  test("passes each method argument as its own argv entry, without a shell", async () => {
    const { login, output } = run(["argv", "--flag", "two words", "$(echo no)"]);
    expect(await login.done).toBe(true);
    expect(JSON.parse(output())).toEqual(["--flag", "two words", "$(echo no)"]);
  });

  test("applies the method's allowed environment", async () => {
    const { login, output } = run(["env"], { LOGIN_REGION: "eu" });
    expect(await login.done).toBe(true);
    expect(output().trim()).toBe("eu");
  });

  test("a non-zero exit fails and stderr arrives without escapes", async () => {
    const { login, output } = run(["fail"]);
    expect(await login.done).toBe(false);
    const text = output();
    expect(text).toContain("denied");
    expect(text).not.toContain("\u001b");
  });

  test("an input line reaches the login command", async () => {
    const { login, output } = run(["code"]);
    while (!output().includes("paste the code")) await Bun.sleep(10);
    login.write("123-456");
    expect(await login.done).toBe(true);
    expect(() => login.write("two\nlines")).toThrow();
  });

  test("cancel stops the login command and fails it", async () => {
    const { login } = run(["hang"]);
    await login.cancel();
    expect(await login.done).toBe(false);
  });
});
