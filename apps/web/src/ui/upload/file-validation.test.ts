import { pictureAccept, pictureMaxSize, validateFiles, validatePicture } from "./file-validation";
import { expect, test } from "bun:test";

test("picture validation accepts the size boundary and rejects oversized or unsupported sources", () => {
  const options = { accept: pictureAccept, maxSize: pictureMaxSize };
  expect(
    validateFiles(
      [new File([new Uint8Array(pictureMaxSize)], "photo.png", { type: "image/png" })],
      options,
    ),
  ).toBeNull();
  expect(
    validateFiles(
      [new File([new Uint8Array(pictureMaxSize + 1)], "photo.png", { type: "image/png" })],
      options,
    ),
  ).toBe("Each file must be 5 MB or smaller.");
  expect(validateFiles([new File(["svg"], "photo.svg", { type: "image/svg+xml" })], options)).toBe(
    "This file type is not supported.",
  );
});

test("generic uploads support any bytes, extensions, MIME wildcards, and multiple selection", () => {
  const file = new File(["bytes"], "report.CSV");
  expect(validateFiles([file], {})).toBeNull();
  expect(validateFiles([file], { accept: ".csv" })).toBeNull();
  expect(
    validateFiles([new File([], "a.webp", { type: "image/webp" })], { accept: "image/*" }),
  ).toBeNull();
  expect(validateFiles([file, file], {})).toBe("Choose one file at a time.");
  expect(validateFiles([file, file], { multiple: true })).toBeNull();
});

test("multiple uploads validate every file against the shared accepted types and size limit", () => {
  const csv = new File(["data"], "report.CSV");
  const png = new File(["image"], "photo.png", { type: "image/png" });
  const options = { accept: " .csv, IMAGE/*, ", multiple: true, maxSize: 1024 * 1024 };
  expect(validateFiles([csv, png], options)).toBeNull();
  expect(validateFiles([csv, new File(["text"], "notes.txt")], options)).toBe(
    "This file type is not supported.",
  );
  expect(
    validateFiles([csv, new File([new Uint8Array(options.maxSize + 1)], "large.csv")], options),
  ).toBe("Each file must be 1 MB or smaller.");
});

test("picture signatures reject renamed unsupported content before decoding", async () => {
  expect(await validatePicture(new File(["GIF89a"], "fake.png", { type: "image/png" }))).toContain(
    "could not be opened",
  );
  expect(
    await validatePicture(
      new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "picture.png", {
        type: "image/png",
      }),
    ),
  ).toBeNull();
  expect(
    await validatePicture(
      new File([new Uint8Array([255, 216, 255])], "picture.jpg", { type: "image/jpeg" }),
    ),
  ).toBeNull();
  expect(
    await validatePicture(new File(["RIFF0000WEBP"], "picture.webp", { type: "image/webp" })),
  ).toBeNull();
});
