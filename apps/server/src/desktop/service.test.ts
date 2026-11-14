import { openDesktop } from "./service";
import { expect, test } from "bun:test";

test("desktop handoff links open the app, the browser, or the installer for the same destination", () => {
  const webURL = "https://app.example.test";
  expect(openDesktop("/accept-invitation/invite-1", { scheme: "substrate", webURL })).toEqual({
    link: "substrate://open/accept-invitation/invite-1",
    browserURL: "https://app.example.test/accept-invitation/invite-1",
    downloadURL: "https://app.example.test/download?redirect=%2Faccept-invitation%2Finvite-1",
  });
  expect(openDesktop("/accept-invitation/invite-1", { scheme: "substrate-dev", webURL }).link).toBe(
    "substrate-dev://open/accept-invitation/invite-1",
  );
});
