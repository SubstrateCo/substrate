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
let cache = "";
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
              "set-cookie": `better-auth.session_token=${token}; Path=/; Max-Age=3600${cache ? `, better-auth.session_data=${cache}; Path=/; Max-Age=60` : ""}`,
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
// Establish the original native cookie before measuring subsequent signals.
await authClient.$fetch("/get-session");
invalidated = 0;
changed = 0;

switch (process.argv[2]) {
  case "cache-refresh":
    cache = "refreshed-cache";
    await authClient.$fetch("/get-session");
    console.log(
      JSON.stringify({
        invalidated,
        changed,
        cached: authClient.getCookie().includes("session_data=refreshed-cache"),
      }),
    );
    break;
  case "replaced-cookie":
    token = "replacement-token";
    await authClient.$fetch("/get-session");
    console.log(JSON.stringify({ invalidated, changed }));
    break;
  case "sign-out": {
    holdResponse = true;
    const request = authClient.$fetch("/sign-out", { method: "POST" });
    await Bun.sleep(30);
    const beforeResponse = { invalidated, changed };
    response.resolve(Response.json({ success: true }));
    await request;
    console.log(JSON.stringify({ beforeResponse, invalidated, changed }));
    break;
  }
  default:
    throw new Error("Unknown auth signal scenario");
}
process.exit(0);
