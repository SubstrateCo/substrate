import { mock } from "bun:test";

// Keep Electron and fetch mocks inside this helper process, not the test runner.
Object.defineProperty(process, "type", { value: "browser", configurable: true });
await mock.module("@better-auth/electron/storage", () => ({
  storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }),
}));
const electron = {
  app: { userAgentFallback: "auth-client-test" },
  safeStorage: { isEncryptionAvailable: () => false },
  webContents: { getFocusedWebContents: () => null },
  net: {},
  shell: {},
};
await mock.module("electron", () => ({ default: electron, shell: electron.shell }));

let token = "original-token";
let maxAge = 3600;
const response = Promise.withResolvers<Response>();
let holdResponse = false;
globalThis.fetch = Object.assign(
  async () =>
    holdResponse
      ? response.promise
      : Response.json(
          { status: true },
          {
            headers: {
              "set-cookie": `better-auth.session_token=${token}; Path=/; Max-Age=${maxAge}`,
            },
          },
        ),
  { preconnect() {} },
);

const { createDesktopAuthClient } = await import("./auth-client.js");
let invalidated = 0;
let changed = 0;
const { authClient } = createDesktopAuthClient(
  "http://localhost:3001",
  "http://localhost:3000",
  true,
  () => undefined,
  () => invalidated++,
  () => changed++,
);
if (process.argv[2] === "initial") {
  console.log(JSON.stringify({ invalidated, changed }));
  process.exit(0);
}
// Establish the original native cookie before measuring subsequent signals.
await authClient.$fetch("/get-session");
invalidated = 0;
changed = 0;

switch (process.argv[2]) {
  case "unchanged-cookie":
    maxAge = 7200;
    await authClient.$fetch("/update-user", { method: "POST", body: { name: "New name" } });
    break;
  case "typed-update":
    await authClient.updateUser({ name: "New name" });
    break;
  case "replaced-cookie":
    token = "replacement-token";
    await authClient.$fetch("/get-session");
    break;
  case "sign-out": {
    holdResponse = true;
    const request = authClient.$fetch("/sign-out", { method: "POST" });
    await Bun.sleep(30);
    const beforeResponse = { invalidated, changed };
    response.resolve(Response.json({ success: true }));
    await request;
    console.log(JSON.stringify({ beforeResponse, invalidated, changed }));
    process.exit(0);
  }
  default:
    throw new Error("Unknown auth signal scenario");
}
// Better Auth's typed-action signal is scheduled after the response.
await Bun.sleep(30);
console.log(JSON.stringify({ invalidated, changed }));
