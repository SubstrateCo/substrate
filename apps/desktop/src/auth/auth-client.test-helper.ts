import { mock } from "bun:test";

// Keep Electron and fetch mocks inside this helper process, not the test runner.
Object.defineProperty(process, "type", { value: "browser", configurable: true });
const restoring = process.argv[2] === "restored-session";
let ready = !restoring;
const stores = new Map<string, Map<string, string>>();
const restoredCookie = JSON.stringify({
  "better-auth.session_token": { value: "original-token", expires: null },
  "better-auth.session_data": { value: "old-cache", expires: null },
});
const legacy = new Map([["better-auth.cookie", Buffer.from(restoredCookie).toString("base64")]]);
stores.set("auth", legacy);
await mock.module("@better-auth/electron/storage", () => ({
  storage: ({ configName }: { configName: string }) => {
    let data = stores.get(configName);
    if (!data) {
      data = new Map(
        restoring ? [["better-auth.cookie", Buffer.from(restoredCookie).toString("base64")]] : [],
      );
      stores.set(configName, data);
    }
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
  },
}));
const electron = {
  app: { userAgentFallback: "auth-client-test" },
  safeStorage: {
    isEncryptionAvailable: () => ready,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
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

const { createDesktopAuthClient } = await import("./auth-client.ts");
let invalidated = 0;
let changed = 0;
const desktopAuth = createDesktopAuthClient(
  "http://localhost:3001",
  "http://localhost:3000",
  true,
  () => undefined,
  () => invalidated++,
  () => changed++,
);
const { authClient } = desktopAuth;
ready = true;
desktopAuth.initializeSession();
if (restoring) {
  cache = "refreshed-cache";
  await authClient.$fetch("/get-session");
  console.log(
    JSON.stringify({
      changed,
      cached: authClient.getCookie().includes("session_data=refreshed-cache"),
    }),
  );
  process.exit(0);
}
// Establish the original native cookie before measuring subsequent signals.
await authClient.$fetch("/get-session");
invalidated = 0;
changed = 0;

switch (process.argv[2]) {
  case "storage-origins": {
    const make = (backend: string, smoke: boolean) =>
      createDesktopAuthClient(
        backend,
        "http://localhost:3000",
        smoke,
        () => undefined,
        () => {},
        () => {},
      ).authClient;
    const same = make("http://localhost:3001/", true);
    const other = make("https://api.example.com", true);
    const profile = make("http://localhost:3001", false);
    console.log(
      JSON.stringify({
        sameOrigin: same.getCookie().includes("session_token=original-token"),
        otherOrigin: other.getCookie(),
        otherProfile: profile.getCookie(),
        legacyUntouched:
          stores.get("auth") === legacy &&
          legacy.get("better-auth.cookie") === Buffer.from(restoredCookie).toString("base64"),
      }),
    );
    break;
  }
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
