import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assetPath, backendURL, bundledRenderer, proxyURL } from "./bundled-renderer.js";
import { bundledApplicationURL as origin } from "./navigation.js";

describe("bundled backend configuration", () => {
  test("requires an explicit backend in packaged launches", () => {
    expect(() => backendURL(undefined, true)).toThrow("STARTUP_OS_API_URL");
    expect(backendURL(undefined, false)).toBe("http://localhost:3001");
    expect(backendURL("https://api.example.com/", true)).toBe("https://api.example.com");
    expect(backendURL("http://127.0.0.1:3001", true)).toBe("http://127.0.0.1:3001");
    expect(backendURL("http://[::1]:3001", true)).toBe("http://[::1]:3001");
  });

  test("rejects insecure remote backends and URLs with extra target components", () => {
    for (const url of [
      "http://api.example.com",
      "http://localhost.evil.test",
      "file:///etc/passwd",
      "https://user:password@api.example.com",
      "https://api.example.com/api",
      "https://api.example.com/?target=other",
      "https://api.example.com/#fragment",
    ]) {
      expect(() => backendURL(url, true)).toThrow();
    }
  });

  test("confines API forwarding to the configured backend and app API paths", () => {
    expect(
      proxyURL(`${origin}/api/auth/session?next=https://evil.test`, "https://api.example.com"),
    ).toBe("https://api.example.com/api/auth/session?next=https://evil.test");
    for (const url of [
      "https://evil.test/api/auth",
      `${origin}/api-other`,
      `${origin}//evil.test/api`,
      `${origin}/api/../private`,
      `${origin}/api/%2f../private`,
      `${origin}/api/%5cprivate`,
      "https://user@desktop.startup-os.local/api/auth",
    ]) {
      expect(() => proxyURL(url, "https://api.example.com")).toThrow();
    }
  });
});

describe("bundled assets and responses", () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(process.env.TEMP || tmpdir(), "startup-os-renderer-"));
    await mkdir(join(directory, "dist"));
    await writeFile(join(directory, "dist", "index.html"), "<h1>Workspace</h1>");
    await writeFile(join(directory, "dist", "app.js"), "console.log('workspace')");
    await writeFile(join(directory, "private.txt"), "secret");
    await symlink(directory, join(directory, "dist", "linked"), "junction");
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function handler(fetchUpstream?: (url: string, init: RequestInit) => Promise<Response>) {
    return bundledRenderer({
      directory: join(directory, "dist"),
      backend: "https://api.example.com",
      fetchFile: async (url) => new Response(await Bun.file(fileURLToPath(url)).text()),
      fetchUpstream,
    });
  }

  test("serves workspace history routes but not missing assets or local file traversal", async () => {
    const serve = handler();
    const page = await serve(new Request(`${origin}/projects/project-1`));
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("<h1>Workspace</h1>");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await (await serve(new Request(`${origin}/app.js`))).text()).toBe(
      "console.log('workspace')",
    );
    expect((await serve(new Request(`${origin}/missing.js`))).status).toBe(404);
    expect((await serve(new Request(`${origin}/linked/private.txt`))).status).toBe(404);
    for (const path of [
      "/%2e%2e%2fprivate.txt",
      "/..%5cprivate.txt",
      "/app.js:secret",
      "/%00",
      "/%ZZ",
    ]) {
      expect(await assetPath(join(directory, "dist"), new URL(`${origin}${path}`))).toBeNull();
    }
  });

  test("rejects non-app origins and unsupported asset methods", async () => {
    const serve = handler();
    expect((await serve(new Request("https://evil.test/app.js"))).status).toBe(403);
    expect((await serve(new Request(`${origin}/app.js`, { method: "POST" }))).status).toBe(405);
    const response = await serve(new Request(`${origin}/app.js`, { method: "HEAD" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("forwards cookies and request bodies, strips Host, and preserves independent response cookies", async () => {
    let forwarded: { url: string; init: RequestInit } | undefined;
    let forwardedBody: string | undefined;
    const serve = handler(async (url, init) => {
      forwarded = { url, init };
      forwardedBody = await new Response(init.body).text();
      const headers = new Headers({
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": "99",
      });
      headers.append("set-cookie", "session=abc; Path=/; Secure; HttpOnly");
      headers.append("set-cookie", "account=def; Path=/; Secure");
      return new Response('{"ok":true}', { status: 201, headers });
    });
    const response = await serve(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          Cookie: "session=old",
          Host: "evil.test",
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: '{"email":"user@example.com"}',
      }),
    );
    expect(forwarded?.url).toBe("https://api.example.com/api/auth/sign-in/email");
    const headers = new Headers(forwarded?.init.headers);
    expect(headers.get("host")).toBeNull();
    expect(headers.get("cookie")).toBe("session=old");
    expect(headers.get("origin")).toBe(origin);
    expect(forwardedBody).toBe('{"email":"user@example.com"}');
    expect(forwarded?.init.redirect).toBe("manual");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.getSetCookie()).toEqual([
      "session=abc; Path=/; Secure; HttpOnly",
      "account=def; Path=/; Secure",
    ]);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
  });

  test("returns redirects without following them and reports backend failure", async () => {
    const serve = handler(
      async () => new Response(null, { status: 302, headers: { Location: `${origin}/tasks` } }),
    );
    const response = await serve(new Request(`${origin}/api/auth/callback`));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${origin}/tasks`);
    const failing = handler(async () => {
      throw new Error("offline");
    });
    expect((await failing(new Request(`${origin}/api/auth/session`))).status).toBe(502);
  });

  test("supplies the isolated renderer origin when protocol interception precedes Chromium's Origin header", async () => {
    const forwarded = new Headers();
    const serve = handler(async (_url, init) => {
      forwarded.set("origin", new Headers(init.headers).get("origin") ?? "");
      return Response.json({ success: true });
    });
    const response = await serve(
      new Request(`${origin}/api/auth/sign-up/email`, { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(200);
    expect(forwarded.get("origin")).toBe(origin);
  });

  test("does not forward mutations with an explicitly foreign or opaque origin", async () => {
    let forwarded = false;
    const serve = handler(async () => {
      forwarded = true;
      return Response.json({ success: true });
    });
    for (const value of ["https://evil.test", "null"]) {
      const response = await serve(
        new Request(`${origin}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { Origin: value },
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(forwarded).toBe(false);
  });
});
