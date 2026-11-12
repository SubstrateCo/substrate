import { requestDesktopSignIn } from "./desktop-sign-in";
import { expect, test } from "bun:test";

function fixture() {
  const authenticated = new Set<() => void>();
  const failed = new Set<() => void>();
  const bridge = {
    requestAuth: async () => {},
    onAuthenticated: (callback: () => void) => {
      authenticated.add(callback);
      return () => {
        authenticated.delete(callback);
      };
    },
    onAuthError: (callback: () => void) => {
      failed.add(callback);
      return () => {
        failed.delete(callback);
      };
    },
  };
  return { bridge, authenticated, failed, controller: new AbortController() };
}

test("leaving a pending sign-in removes both subscriptions and ends the wait", async () => {
  const { bridge, authenticated, failed, controller } = fixture();
  const result = requestDesktopSignIn(bridge, controller.signal, () => {});
  controller.abort();
  expect(await result.catch((error: Error) => error)).toBe(controller.signal.reason);
  expect(authenticated.size).toBe(0);
  expect(failed.size).toBe(0);
});

test("an immediate authentication callback during browser opening is not lost", async () => {
  const { bridge, authenticated, failed, controller } = fixture();
  bridge.requestAuth = async () => {
    for (const callback of authenticated) callback();
  };
  await requestDesktopSignIn(bridge, controller.signal, () => {});
  expect(authenticated.size).toBe(0);
  expect(failed.size).toBe(0);
});

test("browser-open failure releases subscriptions and reports the original error", async () => {
  const { bridge, authenticated, failed, controller } = fixture();
  const error = new Error("Cannot open browser");
  bridge.requestAuth = () => Promise.reject(error);
  expect(
    await requestDesktopSignIn(bridge, controller.signal, () => {}).catch(
      (caught: Error) => caught,
    ),
  ).toBe(error);
  expect(authenticated.size).toBe(0);
  expect(failed.size).toBe(0);
});

test("an authentication error releases subscriptions and reports a retryable message", async () => {
  const { bridge, authenticated, failed, controller } = fixture();
  const result = requestDesktopSignIn(bridge, controller.signal, () => {});
  for (const callback of failed) callback();
  expect(await result.catch((error: Error) => error.message)).toContain(
    "Could not complete sign-in",
  );
  expect(authenticated.size).toBe(0);
  expect(failed.size).toBe(0);
});
