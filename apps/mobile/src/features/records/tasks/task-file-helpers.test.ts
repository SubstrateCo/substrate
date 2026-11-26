import { projectPictureFile, safeTaskFilename } from "./task-file-helpers";
import { expect, test } from "bun:test";

test("download names cannot escape the selected folder or contain platform control characters", () => {
  expect(safeTaskFilename("../private\\report:\u0000.pdf")).toBe(".._private_report__.pdf");
  expect(safeTaskFilename("..")).toBe("_");
  expect(safeTaskFilename("")).toBe("attachment");
  expect(safeTaskFilename("Quarterly report.pdf")).toBe("Quarterly report.pdf");
});

test("project pictures keep the picked URI and upload metadata, with usable missing-name defaults", () => {
  expect(
    projectPictureFile({
      uri: "file:///cache/icon",
      mimeType: "image/png",
      fileSize: 42,
    }),
  ).toEqual({
    uri: "file:///cache/icon",
    name: "project-picture.png",
    mimeType: "image/png",
    size: 42,
    file: undefined,
  });
  expect(
    projectPictureFile({
      uri: "file:///cache/photo.jpg",
      fileName: "Team.jpg",
    }),
  ).toEqual({
    uri: "file:///cache/photo.jpg",
    name: "Team.jpg",
    mimeType: "image/jpeg",
    size: 0,
    file: undefined,
  });
});

test("browser project pictures retain the selected bytes and derive a missing size from them", () => {
  const file = new File(["picture bytes"], "Team.png", { type: "image/png" });
  expect(
    projectPictureFile({
      uri: "blob:project-picture",
      fileName: file.name,
      mimeType: file.type,
      file,
    }),
  ).toEqual({
    uri: "blob:project-picture",
    name: "Team.png",
    mimeType: "image/png",
    size: file.size,
    file,
  });
});

test("download names preserve non-ASCII names and replace every forbidden filename character", () => {
  expect(safeTaskFilename('résumé/报告\\:*?"<>|\n.pdf')).toBe("résumé_报告_________.pdf");
});
