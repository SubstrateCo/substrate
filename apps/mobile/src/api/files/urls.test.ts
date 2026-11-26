import { attachmentDownloadURL, pictureBytesURL, privateImageURL } from "./urls";
import { expect, test } from "bun:test";

const base = "https://api.example.com";

test("managed pictures and legacy pictures use mobile byte endpoints, preserving versions", () => {
  expect(pictureBytesURL("/api/v1/files/pictures/avatar/alice?v=one", base)).toBe(
    `${base}/api/mobile/files/pictures/avatar/alice/bytes?v=one`,
  );
  const id = "01900000-0000-7000-8000-000000000001";
  expect(pictureBytesURL(`/api/v1/files/${id}/content`, base)).toBe(
    `${base}/api/mobile/files/${id}/bytes`,
  );
  expect(privateImageURL("/api/v1/files/attachments/messages/preview?attachmentId=one", base)).toBe(
    `${base}/api/mobile/files/attachments/messages/preview?attachmentId=one`,
  );
});

test("private file helpers reject storage URLs and redirect-based content endpoints", () => {
  for (const value of [
    "https://storage.example.com/private?signature=secret",
    "/api/v1/files/pictures/avatar/alice",
    "/api/auth/get-session",
  ])
    expect(() => attachmentDownloadURL(value, base)).toThrow();
  expect(() => pictureBytesURL("https://storage.example.com/picture", base)).toThrow();
  expect(attachmentDownloadURL("/api/v1/files/attachments/tasks/content?taskId=one", base)).toBe(
    `${base}/api/mobile/files/attachments/tasks/content?taskId=one`,
  );
});
