import { expect, test } from "bun:test";
import electron from "electron";
import { spawnSync } from "node:child_process";

test("Electron can load CRM and context contracts from TypeScript source", () => {
  // Electron's Node entry exports a path, not the declared runtime API namespace.
  const executable: unknown = electron;
  // oxlint-disable-next-line deslop/no-runtime-typeof -- Validate Electron's Node entry at the package boundary; its declarations describe the Electron runtime instead.
  if (typeof executable !== "string")
    throw new Error("Electron did not provide an executable path.");
  const result = spawnSync(
    executable,
    [
      "--input-type=module",
      "-e",
      `
        await import('@substrate/contracts/crm/activity');
        await import('@substrate/contracts/crm/export');
        await import('@substrate/contracts/crm/from-message');
        await import('@substrate/contracts/context/input');
      `,
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
    },
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
});
