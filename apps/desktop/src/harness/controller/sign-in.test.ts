import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import type { SignInHarnessMethod } from "@substrate/contracts/harness/ipc";

import { fixture, signInId } from "./test-support.ts";
import { describe, expect, test } from "bun:test";

describe("desktop harness sign-in", () => {
  test("starts with only the harness and method ID and returns only the sign-in state", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    expect(await f.controller.run("signIn", { harness: "claude", methodId: "login" })).toEqual({
      loginId: signInId,
      harness: "claude",
      type: "terminal",
      status: "running",
      output: "Open https://claude.ai/device",
      cursor: 29,
    });
    expect(f.calls.at(-1)).toEqual({
      method: "signIn",
      value: { harness: "claude", methodId: "login" },
    });
  });

  test("relays reads, input lines, cancel, and sign-out to the worker", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    await f.controller.run("readSignIn", { loginId: signInId, cursor: 10 });
    await f.controller.run("sendSignInInput", { loginId: signInId, text: "123-456" });
    await f.controller.run("cancelSignIn", { loginId: signInId });
    await f.controller.run("signOut", { harness: "codex" });
    expect(f.calls.slice(1)).toEqual([
      { method: "readSignIn", value: { loginId: signInId, cursor: 10 } },
      { method: "sendSignInInput", value: { loginId: signInId, text: "123-456" } },
      { method: "cancelSignIn", value: { loginId: signInId } },
      { method: "signOut", value: { harness: "codex" } },
    ]);
  });

  test("rejects malformed renderer input before it reaches the worker", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    const malformed: [SignInHarnessMethod, IpcValue][] = [
      ["sendSignInInput", { loginId: signInId, text: "one\ntwo" }],
      ["readSignIn", { loginId: "../other", cursor: 0 }],
      ["signIn", { harness: "claude", methodId: "login", args: ["--evil"] }],
      ["signOut", { harness: "unknown" }],
    ];
    for (const [method, value] of malformed)
      expect(f.controller.run(method, value)).rejects.toThrow();
    await Bun.sleep(0);
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
  });

  test("a read that answers for another sign-in fails", async () => {
    const f = fixture(undefined, [], {
      signInState: { loginId: "0b0e4c1a-0000-4000-8000-000000000000" },
    });
    await f.controller.run("synchronize");
    expect(f.controller.run("readSignIn", { loginId: signInId, cursor: 0 })).rejects.toThrow();
  });

  test("needs a synchronized worker", async () => {
    const f = fixture();
    expect(f.controller.run("signIn", { harness: "claude", methodId: "login" })).rejects.toThrow(
      "Harness unavailable",
    );
  });
});
