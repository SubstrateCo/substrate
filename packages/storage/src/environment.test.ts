import { expect, test } from "bun:test";
import { storageEnvironment } from "./environment";

test("development has usable local S3 defaults; production must be explicit", () => {
  expect(storageEnvironment({}).endpoint).toBe("http://localhost:4566");
  expect(storageEnvironment({}).bucket).toBe("startup-os-private");
  expect(() => storageEnvironment({ NODE_ENV: "production" })).toThrow("S3_ENDPOINT");
});
