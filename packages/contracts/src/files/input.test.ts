import { createUploadInput } from "./input";
import { expect, test } from "bun:test";

test("uploads bound image MIME types", () => {
  expect(
    createUploadInput.safeParse({
      purpose: "avatar",
      filename: "x.svg",
      contentType: "image/svg+xml",
      size: 100,
    }).success,
  ).toBe(false);
});
