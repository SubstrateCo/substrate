import { expect, test } from "bun:test";
import electron from "electron";
import { spawnSync } from "node:child_process";

test("Electron can load CRM and context contracts from TypeScript source", () => {
  const result = spawnSync(
    String(electron),
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
