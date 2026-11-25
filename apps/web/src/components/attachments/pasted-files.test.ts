import { pastedFiles } from "./pasted-files";
import { expect, test } from "bun:test";

const png = (name: string) => new File([new Uint8Array(4)], name, { type: "image/png" });

test("a pasted clipboard image is attached under a dated name", () => {
  const [file] = pastedFiles(
    { files: [png("image.png")], text: "" },
    new Date(2026, 10, 25, 9, 5, 7),
  );
  expect(file.name).toBe("Pasted image 2026-11-25 at 09.05.07.png");
  expect(file.type).toBe("image/png");
});

test("pasted files keep their own names", () => {
  expect(pastedFiles({ files: [png("roadmap.png")], text: "" }).map((file) => file.name)).toEqual([
    "roadmap.png",
  ]);
});

test("a paste with text pastes the text, even when the app also offers an image", () => {
  expect(pastedFiles({ files: [png("image.png")], text: "Quarterly numbers" })).toEqual([]);
});
