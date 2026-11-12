import { parseServerEnvironment } from "./environment";
import { describe, expect, test } from "bun:test";

const base = {
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  DATABASE_URL: "postgres://localhost/test",
  SMTP_HOST: "localhost",
  EMAIL_FROM: "test@example.com",
};
const parse = (env: Record<string, string | undefined>) =>
  parseServerEnvironment({ ...base, ...env });

const production = {
  NODE_ENV: "production",
  SUBSTRATE_API_URL: "https://api.example.com",
  SUBSTRATE_WEB_URL: "https://app.example.com",
  S3_ENDPOINT: "https://storage.example.com",
  S3_REGION: "us-east-1",
  S3_BUCKET: "private",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("server environment", () => {
  test("production requires explicit secure public origins", () => {
    expect(parse(production).apiURL).toBe(production.SUBSTRATE_API_URL);
    for (const key of ["SUBSTRATE_API_URL", "SUBSTRATE_WEB_URL"]) {
      for (const value of [
        undefined,
        "",
        "http://app.example.com",
        "https://localhost",
        "https://127.0.0.2",
        "https://[::1]",
        "https://[::ffff:127.0.0.1]",
        "https://[::ffff:7f00:1]",
        "https://app.localhost",
      ]) {
        expect(() => parse({ ...production, [key]: value })).toThrow(key);
      }
    }
  });

  test("production rejects insecure or loopback extra frontend origins", () => {
    for (const value of [
      "http://admin.example.com",
      "https://localhost:3000",
      "https://127.0.0.1",
      "https://[::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::ffff:7f00:1]",
    ]) {
      expect(() => parse({ ...production, FRONTEND_ORIGINS: value })).toThrow("FRONTEND_ORIGINS");
    }
    expect(
      parse({ ...production, FRONTEND_ORIGINS: "https://admin.example.com" }).trustedOrigins,
    ).toContain("https://admin.example.com");
  });

  test("pool size is a positive integer and metrics require an explicit opt-in", () => {
    expect(parse({}).databasePoolSize).toBe(10);
    expect(parse({}).serverMetrics).toBe(false);
    expect(parse({ DATABASE_POOL_SIZE: "24", SERVER_METRICS: "1" }).databasePoolSize).toBe(24);
    expect(parse({ SERVER_METRICS: "1" }).serverMetrics).toBe(true);
    for (const value of ["0", "-1", "1.5", "bad"])
      expect(() => parse({ DATABASE_POOL_SIZE: value })).toThrow("DATABASE_POOL_SIZE");
    expect(() => parse({ SERVER_METRICS: "true" })).toThrow("SERVER_METRICS");
  });
  test("one error lists every invalid variable", () => {
    expect(() => parseServerEnvironment({ BETTER_AUTH_SECRET: "short", SMTP_PORT: "bad" })).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /BETTER_AUTH_SECRET[\s\S]*DATABASE_URL[\s\S]*SMTP_HOST[\s\S]*SMTP_PORT[\s\S]*EMAIL_FROM/,
        ),
      }),
    );
  });

  test("production must name every storage setting; development uses local storage", () => {
    let error = "";
    try {
      parse({ NODE_ENV: "production" });
    } catch (caught) {
      error = String(caught);
    }
    for (const key of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ])
      expect(error).toContain(`${key}: Required in production.`);
    expect(parse({}).storage.endpoint).toStartWith("http://localhost");
  });

  test("trusts the desktop scheme, the web app, the bundled renderer and extra origins once each", () => {
    expect(
      parse({
        SUBSTRATE_WEB_URL: "https://app.example.com",
        FRONTEND_ORIGINS: "https://admin.example.com, https://app.example.com",
      }).trustedOrigins,
    ).toEqual([
      "substrate-dev:/",
      "https://app.example.com",
      "https://desktop.substrate.local",
      "https://admin.example.com",
    ]);
  });

  test("production trusts only production desktop callbacks", () => {
    expect(parse(production).desktopScheme).toBe("substrate");
    expect(parse(production).trustedOrigins).toContain("substrate:/");
    expect(parse(production).trustedOrigins).not.toContain("substrate-dev:/");
    expect(parse({}).desktopScheme).toBe("substrate-dev");
    expect(parse({}).trustedOrigins).not.toContain("substrate:/");
  });

  test("binds the API origin's port unless SERVER_PORT names another", () => {
    expect(parse({ SUBSTRATE_API_URL: "http://localhost:3101" }).port).toBe(3101);
    expect(parse({ SUBSTRATE_API_URL: "https://api.example.com" }).port).toBe(443);
    expect(parse({ SUBSTRATE_API_URL: "https://api.example.com", SERVER_PORT: "8080" }).port).toBe(
      8080,
    );
  });

  test("web, API and frontend origins must be explicit origins", () => {
    for (const value of [
      "*",
      "null",
      "https://*.example.com",
      "https://app.example.com/path",
      "https://app.example.com/",
      "https://app.example.com?x=1",
      "https://user:pass@app.example.com",
      "file://desktop",
    ]) {
      for (const key of ["SUBSTRATE_WEB_URL", "SUBSTRATE_API_URL", "FRONTEND_ORIGINS"])
        expect(() => parse({ [key]: value })).toThrow("explicit HTTP or HTTPS origins");
    }
    expect(() => parse({ FRONTEND_ORIGINS: "https://app.example.com," })).toThrow(
      "explicit HTTP or HTTPS origins",
    );
  });

  test("SMTP credentials come as a pair, and empty values count as unset", () => {
    expect(() => parse({ SMTP_USER: "user" })).toThrow("together");
    expect(() => parse({ SMTP_PASSWORD: "pass" })).toThrow("together");
    expect(parse({ SMTP_USER: "", SMTP_PASSWORD: "" }).smtp.auth).toBeUndefined();
    expect(parse({ SMTP_USER: "user", SMTP_PASSWORD: "pass" }).smtp.auth).toEqual({
      user: "user",
      pass: "pass",
    });
  });

  test("the Windows installer link must be HTTPS without credentials", () => {
    expect(parse({}).windowsDownloadURL).toBeUndefined();
    expect(
      parse({ SUBSTRATE_WINDOWS_DOWNLOAD_URL: "https://downloads.example.test/Substrate.exe" })
        .windowsDownloadURL,
    ).toBe("https://downloads.example.test/Substrate.exe");
    for (const value of [
      "http://downloads.example.test/setup.exe",
      "javascript:alert(1)",
      "https://user:password@downloads.example.test/setup.exe",
      "//downloads.example.test/setup.exe",
    ])
      expect(() => parse({ SUBSTRATE_WINDOWS_DOWNLOAD_URL: value })).toThrow("HTTPS");
  });
});
