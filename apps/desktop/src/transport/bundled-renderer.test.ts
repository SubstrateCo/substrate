import { bundledApplicationURL } from "../shell/navigation.ts";
import { assetPath, backendURL, bundledRenderer, proxyURL } from "./bundled-renderer.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("bundled backend configuration", () => {
  test("requires an explicit backend in packaged launches", () => {
    expect(() => backendURL(undefined, true)).toThrow("SUBSTRATE_API_URL");
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
      proxyURL(
        `${bundledApplicationURL}/api/auth/session?next=https://evil.test`,
        "https://api.example.com",
      ),
    ).toBe("https://api.example.com/api/auth/session?next=https://evil.test");
    for (const url of [
      "https://evil.test/api/auth",
      `${bundledApplicationURL}/api-other`,
      `${bundledApplicationURL}//evil.test/api`,
      `${bundledApplicationURL}/api/../private`,
      `${bundledApplicationURL}/api/%2f../private`,
      `${bundledApplicationURL}/api/%5cprivate`,
      "https://user@desktop.substrate.local/api/auth",
    ]) {
      expect(() => proxyURL(url, "https://api.example.com")).toThrow();
    }
  });
});

describe("bundled assets and responses", () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(process.env.TEMP || tmpdir(), "substrate-renderer-"));
    await mkdir(join(directory, "dist"));
    await writeFile(join(directory, "dist", "index.html"), "<h1>Workspace</h1>");
    await writeFile(join(directory, "dist", "app.js"), "console.log('workspace')");
    await writeFile(
      join(directory, "dist", "mail-body.html"),
      "<!doctype html><title>Mail content</title>",
    );
    await writeFile(join(directory, "dist", "overlay.html"), "<h1>Overlay</h1>");
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
    const page = await serve(new Request(`${bundledApplicationURL}/projects/project-1`));
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("<h1>Workspace</h1>");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await (await serve(new Request(`${bundledApplicationURL}/app.js`))).text()).toBe(
      "console.log('workspace')",
    );
    expect((await serve(new Request(`${bundledApplicationURL}/missing.js`))).status).toBe(404);
    expect((await serve(new Request(`${bundledApplicationURL}/linked/private.txt`))).status).toBe(
      404,
    );
    for (const path of [
      "/%2e%2e%2fprivate.txt",
      "/..%5cprivate.txt",
      "/app.js:secret",
      "/%00",
      "/%ZZ",
    ]) {
      expect(
        await assetPath(join(directory, "dist"), new URL(`${bundledApplicationURL}${path}`)),
      ).toBeNull();
    }
  });

  test("serves the overlay entry itself and never falls back to the workspace for an HTML file", async () => {
    const serve = handler();
    expect(await (await serve(new Request(`${bundledApplicationURL}/overlay.html`))).text()).toBe(
      "<h1>Overlay</h1>",
    );
    expect((await serve(new Request(`${bundledApplicationURL}/missing.html`))).status).toBe(404);
  });

  test("rejects non-app origins and unsupported asset methods", async () => {
    const serve = handler();
    expect((await serve(new Request("https://evil.test/app.js"))).status).toBe(403);
    expect(
      (await serve(new Request(`${bundledApplicationURL}/app.js`, { method: "POST" }))).status,
    ).toBe(405);
    const response = await serve(
      new Request(`${bundledApplicationURL}/app.js`, { method: "HEAD" }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
  test("only the fixed mail frame can be embedded; its content cannot run scripts or request external resources", async () => {
    const serve = handler(),
      app = await serve(new Request(`${bundledApplicationURL}/inbox`));
    expect(app.headers.get("content-security-policy")).toContain(
      `frame-src ${bundledApplicationURL}/mail-body.html;`,
    );
    const mail = await serve(new Request(`${bundledApplicationURL}/mail-body.html`));
    expect(mail.status).toBe(200);
    expect(mail.headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-same-origin",
    );
  });

  test("allows blob image previews and only configured storage connections and images", async () => {
    const serve = bundledRenderer({
      directory: join(directory, "dist"),
      backend: "https://api.example.com",
      storageOrigins: ["https://storage.example.test"],
      fetchFile: async () => new Response("workspace"),
    });
    const response = await serve(new Request(`${bundledApplicationURL}/`));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("img-src 'self' data: blob: https://storage.example.test;");
    expect(csp).toContain("connect-src 'self' https://storage.example.test;");
    expect(csp).not.toContain("https:*");
    expect(csp).not.toContain("script-src blob:");
    expect((await serve(new Request("https://storage.example.test/image"))).status).toBe(403);
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
      new Request(`${bundledApplicationURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          Cookie: "session=old",
          Host: "evil.test",
          Origin: bundledApplicationURL,
          "Content-Type": "application/json",
        },
        body: '{"email":"user@example.com"}',
      }),
    );
    expect(forwarded?.url).toBe("https://api.example.com/api/auth/sign-in/email");
    const headers = new Headers(forwarded?.init.headers);
    expect(headers.get("host")).toBeNull();
    expect(headers.get("cookie")).toBe("session=old");
    expect(headers.get("origin")).toBe(bundledApplicationURL);
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
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: `${bundledApplicationURL}/tasks` },
        }),
    );
    const response = await serve(new Request(`${bundledApplicationURL}/api/auth/callback`));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${bundledApplicationURL}/tasks`);
    const failing = handler(async () => {
      throw new Error("offline");
    });
    expect((await failing(new Request(`${bundledApplicationURL}/api/auth/session`))).status).toBe(
      502,
    );
  });

  test("supplies the isolated renderer origin when protocol interception precedes Chromium's Origin header", async () => {
    const forwarded = new Headers();
    const serve = handler(async (_url, init) => {
      forwarded.set("origin", new Headers(init.headers).get("origin") ?? "");
      return Response.json({ success: true });
    });
    const response = await serve(
      new Request(`${bundledApplicationURL}/api/auth/sign-up/email`, {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect(forwarded.get("origin")).toBe(bundledApplicationURL);
  });

  test("bounds the wait for upstream headers but not the body that follows", async () => {
    let signal: AbortSignal | undefined;
    const serve = bundledRenderer({
      directory: join(directory, "dist"),
      backend: "https://api.example.com",
      fetchFile: async () => new Response(""),
      headersTimeoutMs: 20,
      fetchUpstream: async (_url, init) => {
        signal = init.signal ?? undefined;
        return new Response(new ReadableStream({ pull: () => new Promise(() => {}) }));
      },
    });
    await serve(new Request(`${bundledApplicationURL}/api/v1/files/pictures/p1`));
    await Bun.sleep(60);
    expect(signal?.aborted).toBe(false);

    const stalled = bundledRenderer({
      directory: join(directory, "dist"),
      backend: "https://api.example.com",
      fetchFile: async () => new Response(""),
      headersTimeoutMs: 20,
      fetchUpstream: (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    });
    expect((await stalled(new Request(`${bundledApplicationURL}/api/v1/files/x`))).status).toBe(
      502,
    );
  });

  test("an upstream body failure does not surface on a body Electron never reads", async () => {
    let fail: (error: Error) => void = () => {};
    const serve = handler(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              fail = (error) => controller.error(error);
            },
          }),
        ),
    );
    const response = await serve(new Request(`${bundledApplicationURL}/api/v1/files/pictures/p1`));
    // Electron wraps the body in Node's Readable.fromWeb, which destroys the stream with an
    // 'error' as soon as reader.closed rejects. A request Chromium dropped has no listener left.
    const reader = response.body!.getReader();
    let settled = false;
    reader.closed.then(
      () => (settled = true),
      () => (settled = true),
    );
    fail(new Error("socket closed"));
    await Bun.sleep(20);
    expect(settled).toBe(false);
  });

  test("a body that is being read still reports an upstream failure instead of ending early", async () => {
    const serve = handler(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("partial"));
              setTimeout(() => controller.error(new Error("socket closed")), 5);
            },
          }),
        ),
    );
    const response = await serve(new Request(`${bundledApplicationURL}/api/v1/files/pictures/p1`));
    expect(await response.text().catch((error: Error) => error.message)).toBe("socket closed");
  });

  test("does not forward mutations with an explicitly foreign or opaque origin", async () => {
    let forwarded = false;
    const serve = handler(async () => {
      forwarded = true;
      return Response.json({ success: true });
    });
    for (const value of ["https://evil.test", "null"]) {
      const response = await serve(
        new Request(`${bundledApplicationURL}/api/auth/sign-up/email`, {
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
