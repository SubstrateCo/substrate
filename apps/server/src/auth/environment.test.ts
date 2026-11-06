import { describe, expect, test } from "bun:test";
import { authEnvironment } from "./environment";

const environment = {
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  DATABASE_URL: "postgres://localhost/test",
  SMTP_HOST: "localhost",
  EMAIL_FROM: "test@example.com",
};

describe("auth environment", () => {
  test("separates API and frontend defaults and trusts the desktop origin", () => {
    const env = authEnvironment(environment);
    expect(env.baseURL).toBe("http://localhost:3001");
    expect(env.frontendURL).toBe("http://localhost:3000");
    expect(env.trustedOrigins).toEqual([
      "http://localhost:3000",
      "https://desktop.startup-os.local",
    ]);
  });

  test("uses explicit API, frontend and trusted origin settings independently", () => {
    const env = authEnvironment({
      ...environment,
      BETTER_AUTH_URL: "https://api.example.com",
      APP_URL: "https://app.example.com",
      FRONTEND_ORIGINS:
        "https://app.example.com, https://desktop.startup-os.local,https://app.example.com",
    });
    expect(env.baseURL).toBe("https://api.example.com");
    expect(env.frontendURL).toBe("https://app.example.com");
    expect(env.trustedOrigins).toEqual([
      "https://app.example.com",
      "https://desktop.startup-os.local",
    ]);
  });

  test("defaults trusted origins to the configured frontend, not the API", () => {
    expect(
      authEnvironment({ ...environment, APP_URL: "https://app.example.com" }).trustedOrigins,
    ).toEqual(["https://app.example.com", "https://desktop.startup-os.local"]);
  });

  test("rejects non-explicit origins", () => {
    for (const origin of [
      "*",
      "null",
      "https://*.example.com",
      "https://app.example.com/path",
      "https://app.example.com/",
      "https://app.example.com?x=1",
      "https://app.example.com#fragment",
      "https://user:pass@app.example.com",
      "file://desktop",
      "",
      "https://app.example.com,",
    ]) {
      expect(() => authEnvironment({ ...environment, FRONTEND_ORIGINS: origin })).toThrow(
        "explicit HTTP or HTTPS origins",
      );
    }
  });

  test("requires a frontend origin for invitation links", () => {
    expect(() =>
      authEnvironment({ ...environment, APP_URL: "https://app.example.com/path" }),
    ).toThrow("explicit HTTP or HTTPS origins");
  });

  test("validates required secrets and SMTP configuration", () => {
    for (const field of ["BETTER_AUTH_SECRET", "DATABASE_URL", "SMTP_HOST", "EMAIL_FROM"]) {
      expect(() => authEnvironment({ ...environment, [field]: undefined })).toThrow(
        `${field} is required.`,
      );
    }
    expect(() => authEnvironment({ ...environment, BETTER_AUTH_SECRET: "short" })).toThrow(
      "at least 32",
    );
    for (const port of ["0", "65536", "1.5", "bad"]) {
      expect(() => authEnvironment({ ...environment, SMTP_PORT: port })).toThrow("valid port");
    }
    expect(() => authEnvironment({ ...environment, SMTP_SECURE: "yes" })).toThrow("true or false");
    expect(() => authEnvironment({ ...environment, SMTP_USER: "user" })).toThrow("together");
    expect(() => authEnvironment({ ...environment, SMTP_PASSWORD: "pass" })).toThrow("together");
  });
});
