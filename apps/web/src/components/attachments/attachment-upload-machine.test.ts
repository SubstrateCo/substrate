import {
  transitionAttachmentUpload,
  type AttachmentUploadDraft,
} from "./attachment-upload-machine";
import { expect, test } from "bun:test";

function draft(): AttachmentUploadDraft {
  return {
    id: "draft",
    file: new File(["bytes"], "notes.txt"),
    status: "uploading",
    progress: 0,
    attempt: 0,
  };
}

test("upload completion makes the file ready and ignores later callbacks and retries", () => {
  const ready = transitionAttachmentUpload(draft(), {
    type: "complete",
    attempt: 0,
    fileId: "file",
  });
  expect(ready).toMatchObject({ status: "ready", fileId: "file", progress: 100 });
  expect(transitionAttachmentUpload(ready, { type: "fail", attempt: 0 })).toBe(ready);
  expect(transitionAttachmentUpload(ready, { type: "progress", attempt: 0, progress: 5 })).toBe(
    ready,
  );
  expect(transitionAttachmentUpload(ready, { type: "retry" })).toBe(ready);
});

test("failure allows one retry with a fresh attempt and reset progress", () => {
  const uploading = transitionAttachmentUpload(draft(), {
    type: "progress",
    attempt: 0,
    progress: 65,
  });
  expect(uploading).toMatchObject({ status: "uploading", progress: 65 });
  expect(transitionAttachmentUpload(uploading, { type: "retry" })).toBe(uploading);
  const failed = transitionAttachmentUpload(uploading, { type: "fail", attempt: 0 });
  expect(failed).toMatchObject({ status: "failed", progress: 65 });
  expect(transitionAttachmentUpload(failed, { type: "complete", attempt: 0, fileId: "late" })).toBe(
    failed,
  );
  const retry = transitionAttachmentUpload(failed, { type: "retry" });
  expect(retry).toMatchObject({ status: "uploading", progress: 0, attempt: 1 });
  expect(transitionAttachmentUpload(retry, { type: "retry" })).toBe(retry);
  expect(
    transitionAttachmentUpload(retry, { type: "complete", attempt: 1, fileId: "retried" }),
  ).toMatchObject({ status: "ready", progress: 100, fileId: "retried" });
});

test("callbacks from replaced attempts cannot modify the current upload", () => {
  const failed = transitionAttachmentUpload(draft(), { type: "fail", attempt: 0 });
  const retry = transitionAttachmentUpload(failed, { type: "retry" });
  expect(transitionAttachmentUpload(retry, { type: "progress", attempt: 0, progress: 90 })).toBe(
    retry,
  );
  expect(transitionAttachmentUpload(retry, { type: "fail", attempt: 0 })).toBe(retry);
  expect(transitionAttachmentUpload(retry, { type: "complete", attempt: 0, fileId: "stale" })).toBe(
    retry,
  );
});
