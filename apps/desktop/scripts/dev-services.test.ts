import { developmentServices, ensureDevelopmentServices } from "./dev-services.js";
import { expect, test } from "bun:test";

for (const [webReady, apiReady, expected] of [
  [true, false, ["dev:server"]],
  [false, true, ["dev:web"]],
  [true, true, []],
  [false, false, ["dev:server", "dev:web"]],
] as const) {
  test(`starts only missing services (frontend=${webReady}, API=${apiReady})`, async () => {
    const available = new Set<string>();
    if (webReady) available.add("http://localhost:3100/login");
    if (apiReady) available.add("http://localhost:3101/api/v1/session");
    const started: string[] = [];
    const services = developmentServices(
      "http://localhost:3100",
      "http://localhost:3101",
      async (url) => {
        if (!available.has(url)) throw new Error("Connection refused");
        return url.endsWith("/login")
          ? new Response("Frontend")
          : Response.json({ success: true, data: null });
      },
    );
    await ensureDevelopmentServices(
      services,
      (service) => {
        started.push(service.script);
        available.add(service.url);
        return { exitCode: null };
      },
      () => false,
    );
    expect(started.sort()).toEqual([...expected].sort());
    expect(await Promise.all(services.map((service) => service.ready()))).toEqual([true, true]);
  });
}

test("API readiness requires the actual anonymous session response, not frontend HTML or an error", async () => {
  for (const response of [
    new Response("<!doctype html><h1>Frontend</h1>", { headers: { "content-type": "text/html" } }),
    Response.json({ success: false, data: null }),
    Response.json({ success: true, data: { user: {} } }),
    Response.json({ success: true }),
    Response.json({ success: true, data: null }, { status: 503 }),
    new Response(null, { status: 302, headers: { location: "/login" } }),
  ]) {
    const [api] = developmentServices(
      "http://localhost:3100",
      "http://localhost:3101",
      async (_url, init) => {
        expect(new Headers(init.headers).get("cookie")).toBeNull();
        expect(init.redirect).toBe("manual");
        return response;
      },
    );
    expect(await api!.ready()).toBe(false);
  }
});

test("does not start services after shutdown begins during the readiness probe", async () => {
  let stopping = false;
  const started: string[] = [];
  const services = developmentServices(
    "http://localhost:3100",
    "http://localhost:3101",
    async () => {
      stopping = true;
      throw new Error("Unavailable");
    },
  );
  await ensureDevelopmentServices(
    services,
    (service) => {
      started.push(service.script);
      return { exitCode: null };
    },
    () => stopping,
  );
  expect(started).toEqual([]);
});

test("reports a started service that exits before becoming ready", async () => {
  const services = developmentServices(
    "http://localhost:3100",
    "http://localhost:3101",
    async () => {
      throw new Error("Unavailable");
    },
  );
  const result = await ensureDevelopmentServices(
    services,
    () => ({ exitCode: 1 }),
    () => false,
  ).then(
    () => "ready",
    (error: Error) => error.message,
  );
  expect(result).toContain("exited before it was ready");
});
