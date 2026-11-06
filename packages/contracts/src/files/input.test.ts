import { createUploadInput, MAX_FILE_BYTES } from "./input";
import { expect, test } from "bun:test";

test("uploads accept generic files but bound image MIME and declared size", () => {
  expect(
    createUploadInput.safeParse({
      purpose: "file",
      filename: "report.pdf",
      contentType: "application/pdf",
      size: 100,
    }).success,
  ).toBe(true);
  for (const data of [
    { purpose: "avatar", filename: "x.svg", contentType: "image/svg+xml", size: 100 },
    { purpose: "avatar", filename: "x.png", contentType: "image/png", size: MAX_FILE_BYTES + 1 },
    { purpose: "file", filename: "", contentType: "text/plain", size: 1 },
  ])
    expect(createUploadInput.safeParse(data).success).toBe(false);
});
