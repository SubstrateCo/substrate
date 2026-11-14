import { launch } from "../process.ts";
import { JsonLineRpc } from "./json-rpc.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("native process exit rejects pending RPC calls instead of hanging", async () => {
  const child = launch(
    process.execPath,
    ["-e", "process.stdin.once('data', () => process.exit(17))"],
    process.cwd(),
  );
  const rpc = new JsonLineRpc(child, () => {});
  try {
    await rejects(rpc.request("initialize", {}), { code: "process-exit" });
  } finally {
    rpc.close();
  }
});

test("malformed native output rejects pending RPC calls", async () => {
  const child = launch(
    process.execPath,
    ["-e", "process.stdin.once('data', () => process.stdout.write('not-json\\n'))"],
    process.cwd(),
  );
  const rpc = new JsonLineRpc(child, () => {});
  try {
    await rejects(rpc.request("initialize", {}), { code: "invalid-protocol" });
  } finally {
    rpc.close();
  }
});

test("one large line split over many chunks is delivered whole, with the messages after it", async () => {
  const child = launch(
    process.execPath,
    [
      "-e",
      `process.stdin.once('data', async (data) => {
        const req = JSON.parse(data);
        const write = (text) => new Promise((resolve) => process.stdout.write(text, resolve));
        await write('{"id":' + req.id + ',"result":"');
        for (let index = 0; index < 200; index++) await write('é'.repeat(5000));
        await write('"}\\n{"method":"after","params":1}\\n{"method":"partial",');
        await write('"params":2}\\n');
      })`,
    ],
    process.cwd(),
  );
  const notified = Promise.withResolvers<void>();
  const methods: (string | undefined)[] = [];
  const rpc = new JsonLineRpc(child, (message) => {
    methods.push(message.method);
    if (message.method === "partial") notified.resolve();
  });
  try {
    expect(await rpc.request<string>("initialize", {})).toBe("é".repeat(1_000_000));
    await notified.promise;
    expect(methods).toEqual(["after", "partial"]);
  } finally {
    rpc.close();
  }
});

test("a line above the size limit rejects pending RPC calls", async () => {
  const child = launch(
    process.execPath,
    [
      "-e",
      `process.stdin.once('data', async () => {
        const write = (text) => new Promise((resolve) => process.stdout.write(text, resolve));
        // 2.5 million two-byte characters: under 4 MB in UTF-16 units, over it in bytes.
        for (let index = 0; index < 50; index++) await write('é'.repeat(50000));
      })`,
    ],
    process.cwd(),
  );
  const rpc = new JsonLineRpc(child, () => {});
  try {
    await rejects(rpc.request("initialize", {}), { code: "protocol-limit" });
  } finally {
    rpc.close();
  }
});

test("native request errors do not leak native response payloads", async () => {
  const child = launch(
    process.execPath,
    [
      "-e",
      "process.stdin.once('data', data => { const req=JSON.parse(data); console.log(JSON.stringify({id:req.id,error:{code:-1,message:'credential-secret'}})); })",
    ],
    process.cwd(),
  );
  const rpc = new JsonLineRpc(child, () => {});
  try {
    const error = await rpc.request("initialize", {}).catch((error: Error) => error);
    expect(error).toMatchObject({ code: "native-request" });
    expect(error instanceof Error && error.message).not.toContain("credential-secret");
  } finally {
    rpc.close();
  }
});
