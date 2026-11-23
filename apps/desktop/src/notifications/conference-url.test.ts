import { joinableConferenceURL } from "./conference-url.ts";
import { expect, test } from "bun:test";

test("accepts HTTPS meeting links on known hosts", () => {
  for (const url of [
    "https://meet.google.com/abc-defg-hij",
    "https://zoom.us/j/123",
    "https://acme.zoom.us/j/123?pwd=x",
    "https://teams.microsoft.com/l/meetup-join/1",
    "https://teams.live.com/meet/1",
    "https://acme.webex.com/meet/someone",
    "https://whereby.com/room",
    "https://around.co/r/room",
    "https://app.slack.com/huddle/T1/C1",
    "https://MEET.google.com/abc",
  ])
    expect(joinableConferenceURL(url)).toBe(new URL(url).href);
});

test("rejects other schemes, credentials, ports, and look-alike hosts", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///C:/Windows/System32/calc.exe",
    "zoommtg://zoom.us/join?confno=1",
    "ms-teams://teams.microsoft.com/l/meetup-join/1",
    "http://meet.google.com/abc",
    "https://user:pass@meet.google.com/abc",
    "https://meet.google.com:8443/abc",
    "https://zoom.us.evil.com/j/1",
    "https://evilzoom.us/j/1",
    "https://webex.com.evil.com/meet",
    "https://meet.google.com.evil.com/abc",
    "https://xn--zom-qla.us/j/1",
    "https://zооm.us/j/1",
    "https://meet.google.com./abc",
    "https://app.slack.com/client/T1/C1",
    "https://evil.com\\@meet.google.com/abc",
    "https://slack.com/huddle/T1/C1",
    "not a url",
    "",
  ])
    expect(joinableConferenceURL(url)).toBeNull();
  expect(joinableConferenceURL(null)).toBeNull();
});
