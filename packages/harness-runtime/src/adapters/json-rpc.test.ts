import { launch } from "../process.ts";
import { JsonLineRpc } from "./json-rpc.ts";
import { expect, test } from "bun:test";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

test("native process exit rejects pending RPC calls instead of hanging", async () => {
  const child = launch(
    process.execPath,
    ["-e", "process.stdin.once('data', () => process.exit(17))"],
    process.cwd(),
  );
  const rpc = new JsonLineRpc(child, () => {});
  try {
    await expect(rpc.request("initialize", {})).rejects.toMatchObject({ code: "process-exit" });
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
    await expect(rpc.request("initialize", {})).rejects.toMatchObject({ code: "invalid-protocol" });
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
