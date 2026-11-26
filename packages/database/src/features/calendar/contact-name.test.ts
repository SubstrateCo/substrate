import { contactNameFromAttendee, isGeneratedContactName } from "./contact-name";
import { expect, test } from "bun:test";

test("a display name wins, trimmed", () => {
  expect(contactNameFromAttendee("tobias@fernhollow.test", "  Tobias Grant ")).toBe("Tobias Grant");
});

test("a display name equal to the email counts as missing", () => {
  expect(contactNameFromAttendee("tobias@fernhollow.test", "Tobias@Fernhollow.test")).toBe(
    "Tobias",
  );
  expect(contactNameFromAttendee("tobias@fernhollow.test", "   ")).toBe("Tobias");
});

test.each([
  ["tobias@fernhollow.test", "Tobias"],
  ["john.smith@x.com", "John Smith"],
  ["mary-jane_smith@x.com", "Mary Jane Smith"],
  ["JOHN.sMith@x.com", "John Smith"],
  ["tobias+cal@x.com", "Tobias"],
  ["josé.álvarez@x.com", "José Álvarez"],
  ["łukasz@x.pl", "Łukasz"],
])("%s is named %s", (email, name) => {
  expect(contactNameFromAttendee(email, null)).toBe(name);
});

test.each([
  // A one-letter part.
  "mary-jane_o@x.com",
  "j.smith@x.com",
  // Digits.
  "quill907@mail.test",
  // More than three parts, or empty parts.
  "aa.bb.cc.dd@x.com",
  "john..smith@x.com",
  ".john@x.com",
  "+cal@x.com",
  // Role mailboxes.
  "info@x.com",
  "Team@x.com",
  "hello@x.com",
  "contact@x.com",
  "support+eu@x.com",
  "sales@x.com",
  "admin@x.com",
  "noreply@x.com",
  "no-reply@x.com",
  "no_reply@x.com",
  "it@x.com",
  "hr@x.com",
  "billing@x.com",
  "calendar@x.com",
])("%s keeps the email", (email) => {
  expect(contactNameFromAttendee(email, undefined)).toBe(email);
});

test("generated names match the email or the derived name, ignoring case", () => {
  expect(isGeneratedContactName("TOBIAS@fernhollow.test", "tobias@fernhollow.test")).toBe(true);
  expect(isGeneratedContactName("tobias", "tobias@fernhollow.test")).toBe(true);
  expect(isGeneratedContactName("Tobi", "tobias@fernhollow.test")).toBe(false);
  expect(isGeneratedContactName("Quill", "quill907@mail.test")).toBe(false);
});
