import { storageEnvironment } from "./environment";
import { expect, test } from "bun:test";

test("production must name its S3 endpoint", () => {
  expect(() => storageEnvironment({ NODE_ENV: "production" })).toThrow("S3_ENDPOINT");
});
